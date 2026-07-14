"""Physics, gradient-boosting, and validation-selected blend models."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .features import CATEGORICAL, FEATURE_COLUMNS


def _raw_mass_from_equiv_rate(rate: np.ndarray, rows: pd.DataFrame) -> np.ndarray:
    hours = rows["HOURS_FULL_SPEED"].to_numpy(dtype=float)
    lcv = rows["fuel_lcv"].to_numpy(dtype=float)
    raw = np.asarray(rate, dtype=float) * hours * 40.2 / lcv
    return np.clip(raw, 0.01, 300.0)


class PhysicsBaseline:
    """Per-ship k·STW³ baseline using trailing robust median k.

    k is target equivalent fuel rate divided by STW³. Each query uses only
    earlier qualified observations from that ship, with a 365-day/160-sample
    trailing window. This makes time drift explicit without future leakage.
    """

    def __init__(self, max_samples: int = 160, max_days: int = 365):
        self.max_samples = max_samples
        self.max_days = max_days
        self.history_: pd.DataFrame | None = None
        self.class_k_: dict[str, float] = {}
        self.global_k_: float = np.nan

    def fit(self, rows: pd.DataFrame) -> "PhysicsBaseline":
        history = rows.loc[
            rows["target_rate"].notna() & rows["SPEED_THROUGH_WATER"].gt(0),
            [
                "_row_id",
                "ship_id",
                "ship_class",
                "day",
                "SPEED_THROUGH_WATER",
                "target_rate",
            ],
        ].copy()
        history["k"] = history["target_rate"] / history["SPEED_THROUGH_WATER"].pow(3)
        lo, hi = history["k"].quantile([0.005, 0.995])
        history = history.loc[history["k"].between(lo, hi)].sort_values(
            ["ship_id", "day", "_row_id"]
        )
        self.history_ = history
        self.class_k_ = history.groupby("ship_class")["k"].median().to_dict()
        self.global_k_ = float(history["k"].median())
        return self

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        if self.history_ is None:
            raise RuntimeError("PhysicsBaseline is not fitted")
        rates: list[float] = []
        for _, row in rows.iterrows():
            day = float(row["day"])
            ship_history = self.history_.loc[
                self.history_["ship_id"].eq(row["ship_id"])
                & self.history_["day"].lt(day)
                & self.history_["day"].ge(day - self.max_days)
            ].tail(self.max_samples)
            if len(ship_history) < 12:
                ship_history = self.history_.loc[
                    self.history_["ship_id"].eq(row["ship_id"])
                    & self.history_["day"].lt(day)
                ].tail(self.max_samples)
            if len(ship_history) >= 8:
                k = float(ship_history["k"].median())
            else:
                k = float(self.class_k_.get(row["ship_class"], self.global_k_))
            stw = float(row["SPEED_THROUGH_WATER"])
            rates.append(k * stw**3)
        return _raw_mass_from_equiv_rate(np.asarray(rates), rows)


class GBMModel:
    """HistGradientBoosting model for equivalent fuel rate per full-speed hour."""

    def __init__(
        self,
        max_iter: int = 220,
        learning_rate: float = 0.06,
        max_leaf_nodes: int = 31,
        min_samples_leaf: int = 24,
        l2_regularization: float = 0.5,
        random_state: int = 20260714,
    ):
        self.params = {
            "max_iter": max_iter,
            "learning_rate": learning_rate,
            "max_leaf_nodes": max_leaf_nodes,
            "min_samples_leaf": min_samples_leaf,
            "l2_regularization": l2_regularization,
            "random_state": random_state,
        }
        numeric = [c for c in FEATURE_COLUMNS if c not in CATEGORICAL]
        preprocess = ColumnTransformer(
            [
                (
                    "numeric",
                    SimpleImputer(strategy="median", add_indicator=True),
                    numeric,
                ),
                (
                    "categorical",
                    Pipeline(
                        [
                            ("impute", SimpleImputer(strategy="most_frequent")),
                            (
                                "onehot",
                                OneHotEncoder(
                                    handle_unknown="ignore", sparse_output=False
                                ),
                            ),
                        ]
                    ),
                    CATEGORICAL,
                ),
            ],
            remainder="drop",
        )
        regressor = HistGradientBoostingRegressor(
            loss="squared_error",
            early_stopping=True,
            validation_fraction=0.12,
            n_iter_no_change=25,
            **self.params,
        )
        self.pipeline = Pipeline([("preprocess", preprocess), ("regressor", regressor)])

    def fit(self, rows: pd.DataFrame) -> "GBMModel":
        self.pipeline.fit(
            rows[FEATURE_COLUMNS], rows["target_rate"].to_numpy(dtype=float)
        )
        return self

    def predict_rate(self, rows: pd.DataFrame) -> np.ndarray:
        rate = self.pipeline.predict(rows[FEATURE_COLUMNS])
        return np.clip(rate, 1e-4, None)

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        return _raw_mass_from_equiv_rate(self.predict_rate(rows), rows)

    def feature_importances(
        self, rows: pd.DataFrame, n_repeats: int = 3
    ) -> pd.DataFrame:
        if rows.empty:
            return pd.DataFrame(columns=["feature", "importance"])
        result = permutation_importance(
            self.pipeline,
            rows[FEATURE_COLUMNS],
            rows["target_rate"].to_numpy(dtype=float),
            scoring="neg_root_mean_squared_error",
            n_repeats=n_repeats,
            random_state=self.params["random_state"],
            n_jobs=1,
        )
        return (
            pd.DataFrame(
                {"feature": FEATURE_COLUMNS, "importance": result.importances_mean}
            )
            .sort_values("importance", ascending=False)
            .reset_index(drop=True)
        )


@dataclass
class BlendModel:
    physics: PhysicsBaseline
    gbm: GBMModel
    gbm_weight: float

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        p = self.physics.predict(rows)
        g = self.gbm.predict(rows)
        return (1.0 - self.gbm_weight) * p + self.gbm_weight * g


def choose_blend_weight(
    actual: np.ndarray, physics: np.ndarray, gbm: np.ndarray
) -> float:
    candidates = np.linspace(0.0, 1.0, 101)
    errors = [
        np.mean((actual - ((1.0 - weight) * physics + weight * gbm)) ** 2)
        for weight in candidates
    ]
    return float(candidates[int(np.argmin(errors))])
