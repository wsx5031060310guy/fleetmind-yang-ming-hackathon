"""Leak-controlled model selection matching official post-maintenance masking."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from .anchor import AnchorSolution, maintenance_with_relative_days
from .features import FeatureSet
from .models import (
    BASELINE_FEATURE_COLUMNS,
    BLEND_NAME,
    GBM_BASELINE_NAME,
    GBM_FOULING_NAME,
    MODEL_NAMES,
    PHYSICS_NAME,
    BlendModel,
    GBMModel,
    PhysicsBaseline,
    choose_blend_weight,
)

TRAIN_SHIPS = tuple(f"S{i}" for i in range(1, 13))


@dataclass(frozen=True)
class ValidationResult:
    comparison: pd.DataFrame
    segment_metrics: pd.DataFrame
    per_window: pd.DataFrame
    blend_weight: float
    selected_model: str
    feature_importances: pd.DataFrame
    heldout_rows: int
    window_count: int
    fouling_rmse_delta: float

    def print_report(self) -> None:
        print("\nValidation comparison")
        print(self.comparison.to_string(index=False, float_format=lambda x: f"{x:.4f}"))
        print("\nExtended simulated-mask segment breakdown")
        print(
            self.segment_metrics.to_string(
                index=False, float_format=lambda x: f"{x:.4f}"
            )
        )
        print(f"\nSelected-model per-window breakdown ({self.selected_model})")
        selected_windows = self.per_window.loc[
            self.per_window["model"].eq(self.selected_model)
        ]
        print(
            selected_windows.to_string(
                index=False, float_format=lambda x: f"{x:.4f}"
            )
        )


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> tuple[float, float, float]:
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    rmse = float(np.sqrt(np.mean(np.square(actual - predicted))))
    valid = np.abs(actual) > 1e-9
    mape = float(
        np.mean(np.abs((actual[valid] - predicted[valid]) / actual[valid])) * 100
    )
    bias = float(np.mean(predicted - actual))
    return rmse, mape, bias


def _candidate_windows(
    features: FeatureSet, maintenance: pd.DataFrame, anchor: AnchorSolution
) -> list[dict[str, object]]:
    """Use every eligible training-ship event, not a hand-picked 14-window subset."""

    frame = features.frame
    events = maintenance_with_relative_days(maintenance, anchor)
    candidates: list[dict[str, object]] = []
    for ship_id in TRAIN_SHIPS:
        ship_events = events.loc[events["ship_id"].eq(ship_id)].sort_values(
            ["event_day", "_event_id"]
        )
        for position, (_, event) in enumerate(ship_events.iterrows()):
            event_day = int(event["event_day"])
            next_day = (
                int(ship_events.iloc[position + 1]["event_day"])
                if position + 1 < len(ship_events)
                else event_day + 46
            )
            end_day = min(event_day + 45, next_day - 1)
            rows = frame.loc[
                frame["ship_id"].eq(ship_id)
                & frame["is_qualified"]
                & frame["target_raw_mass"].notna()
                & frame["target_raw_mass"].gt(0)
                & frame["day"].gt(event_day)
                & frame["day"].le(end_day)
            ].sort_values(["day", "_row_id"])
            if len(rows) < 5:
                continue
            candidates.append(
                {
                    "window_id": f"{ship_id}:{event['event_type']}:day-{event_day}",
                    "ship_id": ship_id,
                    "event_type": event["event_type"],
                    "event_day": event_day,
                    "row_ids": tuple(int(value) for value in rows.head(10)["_row_id"]),
                }
            )
    return sorted(candidates, key=lambda item: (item["ship_id"], item["event_day"]))


def _fit_candidate_models(
    train: pd.DataFrame, heldout: pd.DataFrame
) -> tuple[dict[str, object], dict[str, np.ndarray], float]:
    physics = PhysicsBaseline().fit(train)
    baseline = GBMModel(feature_columns=BASELINE_FEATURE_COLUMNS).fit(train)
    exact_fouling = GBMModel().fit(train)

    predictions = {
        GBM_BASELINE_NAME: baseline.predict(heldout),
        GBM_FOULING_NAME: exact_fouling.predict(heldout),
        PHYSICS_NAME: physics.predict(heldout),
    }
    actual = heldout["target_raw_mass"].to_numpy(dtype=float)
    weight = choose_blend_weight(
        actual, predictions[PHYSICS_NAME], predictions[GBM_FOULING_NAME]
    )
    blend = BlendModel(physics, exact_fouling, weight)
    predictions[BLEND_NAME] = blend.predict(heldout)
    models: dict[str, object] = {
        GBM_BASELINE_NAME: baseline,
        GBM_FOULING_NAME: exact_fouling,
        PHYSICS_NAME: physics,
        BLEND_NAME: blend,
    }
    return models, predictions, weight


def _select_model(comparison: pd.DataFrame) -> str:
    extended = comparison.loc[
        comparison["evaluation"].eq("ExtendedSimulatedMask")
    ].copy()
    # Six-decimal equality is a practical tie. MAPE breaks it; incumbent order
    # breaks a complete tie so complexity never ships without measurable gain.
    extended["_rmse_key"] = extended["RMSE_MT"].round(6)
    extended["_mape_key"] = extended["MAPE_pct"].round(6)
    order = {name: position for position, name in enumerate(MODEL_NAMES)}
    extended["_order"] = extended["model"].map(order)
    return str(
        extended.sort_values(
            ["_rmse_key", "_mape_key", "_order"], kind="stable"
        ).iloc[0]["model"]
    )


def _segment_records(
    heldout: pd.DataFrame, predictions: dict[str, np.ndarray]
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    actual = heldout["target_raw_mass"].to_numpy(dtype=float)
    for dimension, column in (("fuel", "fuel_used"), ("ship_class", "ship_class")):
        for segment in sorted(heldout[column].dropna().unique()):
            mask = heldout[column].eq(segment).to_numpy()
            for model_name in MODEL_NAMES:
                rmse, mape, bias = _metrics(actual[mask], predictions[model_name][mask])
                records.append(
                    {
                        "dimension": dimension,
                        "segment": segment,
                        "n": int(mask.sum()),
                        "model": model_name,
                        "RMSE_MT": rmse,
                        "MAPE_pct": mape,
                        "Bias_MT": bias,
                    }
                )
    return records


def validate_models(
    features: FeatureSet,
    maintenance: pd.DataFrame,
    anchor: AnchorSolution,
    group_splits: int = 5,
) -> ValidationResult:
    frame = features.frame
    windows = _candidate_windows(features, maintenance, anchor)
    if len(windows) < 10:
        raise ValueError(f"too few eligible post-event validation windows: {len(windows)}")
    heldout_ids = {row_id for window in windows for row_id in window["row_ids"]}
    train = frame.loc[
        frame["is_trainable"] & ~frame["_row_id"].isin(heldout_ids)
    ].copy()
    heldout = frame.loc[frame["_row_id"].isin(heldout_ids)].copy()

    models, predictions, weight = _fit_candidate_models(train, heldout)
    actual = heldout["target_raw_mass"].to_numpy(dtype=float)
    comparison_records: list[dict[str, object]] = []
    for model_name in MODEL_NAMES:
        rmse, mape, bias = _metrics(actual, predictions[model_name])
        comparison_records.append(
            {
                "evaluation": "ExtendedSimulatedMask",
                "model": model_name,
                "n": len(heldout),
                "RMSE_MT": rmse,
                "MAPE_pct": mape,
                "Bias_MT": bias,
            }
        )

    prediction_map = pd.DataFrame(
        {"_row_id": heldout["_row_id"].to_numpy(), "actual": actual, **predictions}
    ).set_index("_row_id")
    window_records: list[dict[str, object]] = []
    for window in windows:
        subset = prediction_map.loc[list(window["row_ids"])]
        for model_name in MODEL_NAMES:
            rmse, mape, bias = _metrics(
                subset["actual"].to_numpy(), subset[model_name].to_numpy()
            )
            window_records.append(
                {
                    "window": window["window_id"],
                    "n": len(subset),
                    "model": model_name,
                    "RMSE_MT": rmse,
                    "MAPE_pct": mape,
                    "Bias_MT": bias,
                }
            )

    cv_source = frame.loc[
        frame["is_trainable"] & frame["ship_id"].isin(TRAIN_SHIPS)
    ].copy()
    fold_actual: list[np.ndarray] = []
    fold_predictions = {name: [] for name in MODEL_NAMES}
    splitter = GroupKFold(n_splits=group_splits)
    for train_index, test_index in splitter.split(cv_source, groups=cv_source["ship_id"]):
        fold_train = cv_source.iloc[train_index]
        fold_test = cv_source.iloc[test_index]
        fold_models, fold_pred, _ = _fit_candidate_models(fold_train, fold_test)
        del fold_models
        fold_actual.append(fold_test["_visible_fuel_mass"].to_numpy(dtype=float))
        # Blend selection weight must come only from primary extended validation.
        physics_pred = fold_pred[PHYSICS_NAME]
        exact_pred = fold_pred[GBM_FOULING_NAME]
        fold_pred[BLEND_NAME] = (1.0 - weight) * physics_pred + weight * exact_pred
        for model_name in MODEL_NAMES:
            fold_predictions[model_name].append(fold_pred[model_name])
    cv_actual = np.concatenate(fold_actual)
    for model_name in MODEL_NAMES:
        prediction = np.concatenate(fold_predictions[model_name])
        rmse, mape, bias = _metrics(cv_actual, prediction)
        comparison_records.append(
            {
                "evaluation": "GroupKFoldShip",
                "model": model_name,
                "n": len(cv_actual),
                "RMSE_MT": rmse,
                "MAPE_pct": mape,
                "Bias_MT": bias,
            }
        )

    comparison = pd.DataFrame(comparison_records)
    selected = _select_model(comparison)
    selected_model_object = models[selected]
    if isinstance(selected_model_object, BlendModel):
        importance_model = selected_model_object.gbm
    elif isinstance(selected_model_object, GBMModel):
        importance_model = selected_model_object
    else:
        importance_model = None
    importances = (
        importance_model.feature_importances(heldout, n_repeats=3)
        if importance_model is not None
        else pd.DataFrame(columns=["feature", "importance"])
    )

    extended = comparison.loc[comparison["evaluation"].eq("ExtendedSimulatedMask")]
    baseline_rmse = float(
        extended.loc[extended["model"].eq(GBM_BASELINE_NAME), "RMSE_MT"].iloc[0]
    )
    fouling_rmse = float(
        extended.loc[extended["model"].eq(GBM_FOULING_NAME), "RMSE_MT"].iloc[0]
    )
    return ValidationResult(
        comparison=comparison,
        segment_metrics=pd.DataFrame(_segment_records(heldout, predictions)),
        per_window=pd.DataFrame(window_records),
        blend_weight=weight,
        selected_model=selected,
        feature_importances=importances,
        heldout_rows=len(heldout),
        window_count=len(windows),
        fouling_rmse_delta=fouling_rmse - baseline_rmse,
    )
