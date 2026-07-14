"""Physics, gradient-boosting, and validation-selected candidate models."""

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

from .features import CATEGORICAL, FEATURE_COLUMNS, FOULING_FEATURES

PHYSICS_NAME = "Physics baseline"
GBM_BASELINE_NAME = "GBM baseline"
GBM_FOULING_NAME = "GBM + exact fouling"
BLEND_NAME = "Blend (physics + exact-fouling GBM)"
MODEL_NAMES = (GBM_BASELINE_NAME, GBM_FOULING_NAME, PHYSICS_NAME, BLEND_NAME)
BASELINE_FEATURE_COLUMNS = tuple(
    column for column in FEATURE_COLUMNS if column not in FOULING_FEATURES
)


@dataclass(frozen=True)
class PhysicalMassBounds:
    """Only clip physically impossible mass predictions.

    Upper bounds use 120% of each ship's maximum visible full-speed-period mass.
    Class/global fallbacks support ship-held-out validation folds.
    """

    ship_max: dict[str, float]
    class_max: dict[str, float]
    global_max: float

    @classmethod
    def fit(cls, rows: pd.DataFrame) -> "PhysicalMassBounds":
        visible = rows.loc[
            rows["_visible_fuel_mass"].notna()
            & rows["_visible_fuel_mass"].gt(0),
            ["ship_id", "ship_class", "_visible_fuel_mass"],
        ]
        if visible.empty:
            raise ValueError("cannot derive physical fuel-mass bounds")
        return cls(
            ship_max=visible.groupby("ship_id")["_visible_fuel_mass"].max().to_dict(),
            class_max=visible.groupby("ship_class")["_visible_fuel_mass"].max().to_dict(),
            global_max=float(visible["_visible_fuel_mass"].max()),
        )

    def clip(self, raw: np.ndarray, rows: pd.DataFrame) -> np.ndarray:
        upper = np.asarray(
            [
                1.2
                * self.ship_max.get(
                    str(ship_id), self.class_max.get(str(ship_class), self.global_max)
                )
                for ship_id, ship_class in rows[
                    ["ship_id", "ship_class"]
                ].itertuples(index=False, name=None)
            ],
            dtype=float,
        )
        return np.minimum(np.maximum(np.asarray(raw, dtype=float), 1e-6), upper)


def _raw_mass_from_equiv_rate(
    rate: np.ndarray, rows: pd.DataFrame, bounds: PhysicalMassBounds
) -> np.ndarray:
    hours = rows["HOURS_FULL_SPEED"].to_numpy(dtype=float)
    lcv = rows["fuel_lcv"].to_numpy(dtype=float)
    raw = np.asarray(rate, dtype=float) * hours * 40.2 / lcv
    return bounds.clip(raw, rows)


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
        self.bounds_: PhysicalMassBounds | None = None

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
        self.bounds_ = PhysicalMassBounds.fit(rows)
        return self

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        if self.history_ is None or self.bounds_ is None:
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
        return _raw_mass_from_equiv_rate(np.asarray(rates), rows, self.bounds_)


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
        feature_columns: tuple[str, ...] = tuple(FEATURE_COLUMNS),
    ):
        self.params = {
            "max_iter": max_iter,
            "learning_rate": learning_rate,
            "max_leaf_nodes": max_leaf_nodes,
            "min_samples_leaf": min_samples_leaf,
            "l2_regularization": l2_regularization,
            "random_state": random_state,
        }
        self.feature_columns = feature_columns
        self.bounds_: PhysicalMassBounds | None = None
        numeric = [c for c in feature_columns if c not in CATEGORICAL]
        categorical = [c for c in CATEGORICAL if c in feature_columns]
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
                    categorical,
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
            rows[list(self.feature_columns)], rows["target_rate"].to_numpy(dtype=float)
        )
        self.bounds_ = PhysicalMassBounds.fit(rows)
        return self

    def predict_rate(self, rows: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict(rows[list(self.feature_columns)])

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        if self.bounds_ is None:
            raise RuntimeError("GBMModel is not fitted")
        return _raw_mass_from_equiv_rate(self.predict_rate(rows), rows, self.bounds_)

    def feature_importances(
        self, rows: pd.DataFrame, n_repeats: int = 3
    ) -> pd.DataFrame:
        if rows.empty:
            return pd.DataFrame(columns=["feature", "importance"])
        result = permutation_importance(
            self.pipeline,
            rows[list(self.feature_columns)],
            rows["target_rate"].to_numpy(dtype=float),
            scoring="neg_root_mean_squared_error",
            n_repeats=n_repeats,
            random_state=self.params["random_state"],
            n_jobs=1,
        )
        return (
            pd.DataFrame(
                {
                    "feature": self.feature_columns,
                    "importance": result.importances_mean,
                }
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
        blended = (1.0 - self.gbm_weight) * p + self.gbm_weight * g
        if self.gbm.bounds_ is None:
            raise RuntimeError("BlendModel GBM is not fitted")
        return self.gbm.bounds_.clip(blended, rows)


def choose_blend_weight(
    actual: np.ndarray, physics: np.ndarray, gbm: np.ndarray
) -> float:
    candidates = np.linspace(0.0, 1.0, 101)
    errors = [
        np.mean((actual - ((1.0 - weight) * physics + weight * gbm)) ** 2)
        for weight in candidates
    ]
    return float(candidates[int(np.argmin(errors))])


def fit_named_model(
    name: str,
    rows: pd.DataFrame,
    blend_weight: float,
    feature_columns: tuple[str, ...] = tuple(FEATURE_COLUMNS),
):
    """Fit the validation-selected candidate on all available training rows."""

    baseline_features = tuple(
        column for column in feature_columns if column not in FOULING_FEATURES
    )
    if name == PHYSICS_NAME:
        return PhysicsBaseline().fit(rows)
    if name == GBM_BASELINE_NAME:
        return GBMModel(feature_columns=baseline_features).fit(rows)
    if name == GBM_FOULING_NAME:
        return GBMModel(feature_columns=feature_columns).fit(rows)
    if name == BLEND_NAME:
        physics = PhysicsBaseline().fit(rows)
        gbm = GBMModel(feature_columns=feature_columns).fit(rows)
        return BlendModel(physics, gbm, blend_weight)
    raise ValueError(f"unknown model candidate: {name}")
