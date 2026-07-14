"""Leak-controlled validation matching official post-maintenance masking."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from .anchor import AnchorSolution, maintenance_with_relative_days
from .features import FeatureSet
from .models import GBMModel, PhysicsBaseline, choose_blend_weight

TRAIN_SHIPS = tuple(f"S{i}" for i in range(1, 13))


@dataclass(frozen=True)
class ValidationResult:
    comparison: pd.DataFrame
    per_window: pd.DataFrame
    blend_weight: float
    feature_importances: pd.DataFrame
    heldout_rows: int
    window_count: int

    def print_report(self) -> None:
        print("\nValidation comparison")
        print(self.comparison.to_string(index=False, float_format=lambda x: f"{x:.4f}"))
        print("\nSimulated-mask per-window breakdown")
        print(self.per_window.to_string(index=False, float_format=lambda x: f"{x:.4f}"))


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> tuple[float, float]:
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    rmse = float(np.sqrt(np.mean(np.square(actual - predicted))))
    valid = np.abs(actual) > 1e-9
    mape = float(
        np.mean(np.abs((actual[valid] - predicted[valid]) / actual[valid])) * 100
    )
    return rmse, mape


def _candidate_windows(
    features: FeatureSet, maintenance: pd.DataFrame, anchor: AnchorSolution
) -> list[dict[str, object]]:
    frame = features.frame
    events = maintenance_with_relative_days(maintenance, anchor)
    candidates: list[dict[str, object]] = []
    for ship_id in TRAIN_SHIPS:
        ship_events = events.loc[events["ship_id"].eq(ship_id)].sort_values("event_day")
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
            rows = rows.head(10)
            candidates.append(
                {
                    "window_id": f"{ship_id}:{event['event_type']}:{pd.Timestamp(event['event_date']).date()}",
                    "ship_id": ship_id,
                    "event_type": event["event_type"],
                    "event_date": pd.Timestamp(event["event_date"]),
                    "row_ids": tuple(int(x) for x in rows["_row_id"]),
                }
            )
    return candidates


def _select_windows(
    candidates: list[dict[str, object]], count: int = 14
) -> list[dict[str, object]]:
    if len(candidates) < count:
        return candidates
    selected: list[dict[str, object]] = []
    selected_ids: set[str] = set()
    # First cover as many ships as possible, using each ship's chronologically
    # latest eligible event to resemble current prediction periods.
    for ship_id in TRAIN_SHIPS:
        ship_candidates = [c for c in candidates if c["ship_id"] == ship_id]
        if ship_candidates:
            chosen = max(ship_candidates, key=lambda c: c["event_date"])
            selected.append(chosen)
            selected_ids.add(str(chosen["window_id"]))
    remaining = sorted(
        candidates, key=lambda c: (c["event_date"], c["window_id"]), reverse=True
    )
    for candidate in remaining:
        if len(selected) >= count:
            break
        if str(candidate["window_id"]) not in selected_ids:
            selected.append(candidate)
            selected_ids.add(str(candidate["window_id"]))
    return sorted(selected[:count], key=lambda c: (c["ship_id"], c["event_date"]))


def validate_models(
    features: FeatureSet,
    maintenance: pd.DataFrame,
    anchor: AnchorSolution,
    group_splits: int = 5,
) -> ValidationResult:
    frame = features.frame
    candidates = _candidate_windows(features, maintenance, anchor)
    windows = _select_windows(candidates, 14)
    if len(windows) < 10:
        raise ValueError(
            f"too few eligible post-event validation windows: {len(windows)}"
        )
    heldout_ids = {row_id for window in windows for row_id in window["row_ids"]}
    train = frame.loc[
        frame["is_trainable"] & ~frame["_row_id"].isin(heldout_ids)
    ].copy()
    heldout = frame.loc[frame["_row_id"].isin(heldout_ids)].copy()

    physics = PhysicsBaseline().fit(train)
    gbm = GBMModel().fit(train)
    actual = heldout["target_raw_mass"].to_numpy(dtype=float)
    physics_pred = physics.predict(heldout)
    gbm_pred = gbm.predict(heldout)
    weight = choose_blend_weight(actual, physics_pred, gbm_pred)
    blend_pred = (1.0 - weight) * physics_pred + weight * gbm_pred

    comparison_records: list[dict[str, object]] = []
    for model_name, prediction in (
        ("PhysicsBaseline", physics_pred),
        ("GBMModel", gbm_pred),
        ("BlendModel", blend_pred),
    ):
        rmse, mape = _metrics(actual, prediction)
        comparison_records.append(
            {
                "evaluation": "SimulatedMask",
                "model": model_name,
                "RMSE_MT": rmse,
                "MAPE_pct": mape,
            }
        )

    prediction_map = pd.DataFrame(
        {
            "_row_id": heldout["_row_id"].to_numpy(),
            "actual": actual,
            "PhysicsBaseline": physics_pred,
            "GBMModel": gbm_pred,
            "BlendModel": blend_pred,
        }
    ).set_index("_row_id")
    window_records: list[dict[str, object]] = []
    for window in windows:
        subset = prediction_map.loc[list(window["row_ids"])]
        for model_name in ("PhysicsBaseline", "GBMModel", "BlendModel"):
            rmse, mape = _metrics(
                subset["actual"].to_numpy(), subset[model_name].to_numpy()
            )
            window_records.append(
                {
                    "window": window["window_id"],
                    "n": len(subset),
                    "model": model_name,
                    "RMSE_MT": rmse,
                    "MAPE_pct": mape,
                }
            )

    cv_source = frame.loc[
        frame["is_trainable"] & frame["ship_id"].isin(TRAIN_SHIPS)
    ].copy()
    fold_actual: list[np.ndarray] = []
    fold_physics: list[np.ndarray] = []
    fold_gbm: list[np.ndarray] = []
    splitter = GroupKFold(n_splits=group_splits)
    for train_index, test_index in splitter.split(
        cv_source, groups=cv_source["ship_id"]
    ):
        fold_train = cv_source.iloc[train_index]
        fold_test = cv_source.iloc[test_index]
        fold_physics_model = PhysicsBaseline().fit(fold_train)
        fold_gbm_model = GBMModel().fit(fold_train)
        fold_actual.append(fold_test["_visible_fuel_mass"].to_numpy(dtype=float))
        fold_physics.append(fold_physics_model.predict(fold_test))
        fold_gbm.append(fold_gbm_model.predict(fold_test))
    cv_actual = np.concatenate(fold_actual)
    cv_physics = np.concatenate(fold_physics)
    cv_gbm = np.concatenate(fold_gbm)
    cv_blend = (1.0 - weight) * cv_physics + weight * cv_gbm
    for model_name, prediction in (
        ("PhysicsBaseline", cv_physics),
        ("GBMModel", cv_gbm),
        ("BlendModel", cv_blend),
    ):
        rmse, mape = _metrics(cv_actual, prediction)
        comparison_records.append(
            {
                "evaluation": "GroupKFoldShip",
                "model": model_name,
                "RMSE_MT": rmse,
                "MAPE_pct": mape,
            }
        )

    importances = gbm.feature_importances(heldout, n_repeats=3)
    return ValidationResult(
        comparison=pd.DataFrame(comparison_records),
        per_window=pd.DataFrame(window_records),
        blend_weight=weight,
        feature_importances=importances,
        heldout_rows=len(heldout),
        window_count=len(windows),
    )
