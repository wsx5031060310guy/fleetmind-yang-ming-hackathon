"""Leak-controlled model selection matching official post-maintenance masking."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from .anchor import AnchorSolution, maintenance_with_relative_days
from .features import FOULING_FEATURES, FeatureSet
from .models import (
    BLEND_NAME,
    GBM_BASELINE_NAME,
    GBM_FOULING_NAME,
    MODEL_NAMES,
    PHYSICS_NAME,
    BlendModel,
    GBMModel,
    PhysicsBaseline,
    choose_blend_weight,
    fit_named_model,
)

TRAIN_SHIPS = tuple(f"S{i}" for i in range(1, 13))
PREDICTION_SHIPS = ("S21", "S22", "S23")


@dataclass(frozen=True)
class ValidationResult:
    comparison: pd.DataFrame
    segment_metrics: pd.DataFrame
    validation_report: pd.DataFrame
    residual_std: pd.DataFrame
    overall_residual_std: float
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
        print(f"\nSelected-model persisted validation report ({self.selected_model})")
        print(
            self.validation_report.to_string(
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

    def write_report(self, output_path: str | Path) -> Path:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.validation_report.to_csv(destination, index=False, float_format="%.6f")
        return destination


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
    features: FeatureSet,
    maintenance: pd.DataFrame,
    anchor: AnchorSolution,
    ships: tuple[str, ...] = TRAIN_SHIPS,
) -> list[dict[str, object]]:
    """Use every eligible event, not a hand-picked window subset."""

    frame = features.frame
    events = maintenance_with_relative_days(maintenance, anchor)
    candidates: list[dict[str, object]] = []
    for ship_id in ships:
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
    train: pd.DataFrame,
    heldout: pd.DataFrame,
    feature_columns: tuple[str, ...],
) -> tuple[dict[str, object], dict[str, np.ndarray], float]:
    physics = PhysicsBaseline().fit(train)
    baseline_features = tuple(
        column for column in feature_columns if column not in FOULING_FEATURES
    )
    baseline = GBMModel(feature_columns=baseline_features).fit(train)
    exact_fouling = GBMModel(feature_columns=feature_columns).fit(train)

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


def _metric_record(
    dimension: str,
    segment: str,
    actual: np.ndarray,
    predicted: np.ndarray,
) -> dict[str, object]:
    rmse, mape, bias = _metrics(actual, predicted)
    return {
        "dimension": dimension,
        "segment": segment,
        "n": len(actual),
        "RMSE_MT": rmse,
        "MAPE_pct": mape,
        "Bias_MT": bias,
    }


def _prediction_ship_report(
    features: FeatureSet,
    maintenance: pd.DataFrame,
    anchor: AnchorSolution,
    selected_model: str,
    blend_weight: float,
) -> list[dict[str, object]]:
    """Evaluate selected model on separate visible masks for S21-S23.

    These diagnostics never participate in model selection. Actual official
    PREDICT cells remain hidden; only visible post-event rows are held out.
    """

    windows = _candidate_windows(
        features, maintenance, anchor, ships=PREDICTION_SHIPS
    )
    heldout_ids = {row_id for window in windows for row_id in window["row_ids"]}
    frame = features.frame
    train = frame.loc[
        frame["is_trainable"] & ~frame["_row_id"].isin(heldout_ids)
    ].copy()
    heldout = frame.loc[frame["_row_id"].isin(heldout_ids)].copy()
    if heldout.empty:
        raise ValueError("no visible prediction-ship rows for diagnostic masks")
    model = fit_named_model(
        selected_model, train, blend_weight, features.feature_columns
    )
    predicted = model.predict(heldout)
    records: list[dict[str, object]] = []
    for ship_id in PREDICTION_SHIPS:
        mask = heldout["ship_id"].eq(ship_id).to_numpy()
        if not mask.any():
            raise ValueError(
                f"no visible simulated-mask diagnostic rows for {ship_id}"
            )
        records.append(
            _metric_record(
                "prediction_ship",
                ship_id,
                heldout.loc[mask, "target_raw_mass"].to_numpy(dtype=float),
                predicted[mask],
            )
        )
    return records


def _selected_validation_report(
    heldout: pd.DataFrame,
    predicted: np.ndarray,
    prediction_ship_records: list[dict[str, object]],
) -> pd.DataFrame:
    actual = heldout["target_raw_mass"].to_numpy(dtype=float)
    records = [_metric_record("overall", "overall", actual, predicted)]
    for fuel in ("HSHFO", "VLSFO"):
        fuel_type = f"ME_FULLSPEED_CONSUMP_{fuel}"
        mask = heldout["fuel_used"].eq(fuel_type).to_numpy()
        if not mask.any():
            raise ValueError(f"validation slice missing required fuel: {fuel}")
        records.append(_metric_record("fuel", fuel, actual[mask], predicted[mask]))
    for ship_class in ("W1", "W2"):
        mask = heldout["ship_class"].eq(ship_class).to_numpy()
        if not mask.any():
            raise ValueError(
                f"validation slice missing required ship class: {ship_class}"
            )
        records.append(
            _metric_record(
                "ship_class", ship_class, actual[mask], predicted[mask]
            )
        )
    records.extend(prediction_ship_records)
    return pd.DataFrame(records)


def _residual_std_report(
    heldout: pd.DataFrame, predicted: np.ndarray
) -> tuple[pd.DataFrame, float]:
    residuals = heldout[["ship_class", "fuel_used"]].copy()
    residuals["residual"] = (
        np.asarray(predicted, dtype=float)
        - heldout["target_raw_mass"].to_numpy(dtype=float)
    )
    grouped = (
        residuals.groupby(["ship_class", "fuel_used"], dropna=False)["residual"]
        .agg(n="size", residual_std_mt="std")
        .reset_index()
        .rename(columns={"fuel_used": "fuel_type"})
    )
    overall = float(residuals["residual"].std(ddof=1))
    grouped["residual_std_mt"] = grouped["residual_std_mt"].fillna(overall)
    return grouped, overall


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

    models, predictions, weight = _fit_candidate_models(
        train, heldout, features.feature_columns
    )
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
        fold_models, fold_pred, _ = _fit_candidate_models(
            fold_train, fold_test, features.feature_columns
        )
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
    selected_predictions = predictions[selected]
    prediction_ship_records = _prediction_ship_report(
        features, maintenance, anchor, selected, weight
    )
    validation_report = _selected_validation_report(
        heldout, selected_predictions, prediction_ship_records
    )
    residual_std, overall_residual_std = _residual_std_report(
        heldout, selected_predictions
    )
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
        validation_report=validation_report,
        residual_std=residual_std,
        overall_residual_std=overall_residual_std,
        per_window=pd.DataFrame(window_records),
        blend_weight=weight,
        selected_model=selected,
        feature_importances=importances,
        heldout_rows=len(heldout),
        window_count=len(windows),
        fouling_rmse_delta=fouling_rmse - baseline_rmse,
    )
