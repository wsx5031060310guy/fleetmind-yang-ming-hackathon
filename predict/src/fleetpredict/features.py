"""Feature engineering for physical fuel-rate prediction.

Feature rationale:
- STW, SOG, STW^3, RPM, propeller speed and slip describe propulsion demand.
- draft, displacement and cargo control loading/resistance differences.
- wind/wave/swell, water depth and temperature control environmental resistance;
  numeric directions become head/beam/following components when present.
- hull/propeller clocks and cumulative positive sea-temperature degree-days
  represent physical fouling pressure. UWI never resets any clock.
- ship identity/class capture sister-ship intercepts; fuel identity/LCV captures
  energy density; full-speed hours both conditions rate and reconstructs mass.
- relative day and annual harmonics capture remaining slow temporal/seasonal drift.

Targets are VLSFO-equivalent mass per full-speed hour. This retains every visible,
qualified row including multi-fuel days. Prediction converts equivalent mass back
to the requested fuel by LCV; target HSHFO/VLSFO both use 40.2 MJ/kg.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .anchor import AnchorSolution, maintenance_with_relative_days
from .load import Dataset, LCV_BY_FUEL

HULL_INTERVENTIONS = frozenset({"UWC", "UWC+PP", "DD"})
PROP_INTERVENTIONS = frozenset({"PP", "UWI+PP", "UWC+PP", "DD"})

BASE_NUMERIC = [
    "SPEED_THROUGH_WATER",
    "AVG_SPEED",
    "STW_CUBED",
    "ME_AVG_RPM",
    "PROPELLER_SPEED",
    "DIFF_STW_SOG_SLIP",
    "FULL_SPD_STW_SLIP",
    "MID_DRAFT",
    "DRAFT_MEAN",
    "DISPLACEMENT",
    "CARGO_ON_BOARD",
    "WIND_SCALE",
    "WIND_SPEED",
    "SEA_HEIGHT",
    "SWELL_HEIGHT",
    "SEA_WATER_TEMP",
    "WATER_DEPTH",
    "WIND_HEAD",
    "WIND_BEAM",
    "WIND_FOLLOWING",
    "SEA_HEAD",
    "SEA_BEAM",
    "SEA_FOLLOWING",
    "SWELL_HEAD",
    "SWELL_BEAM",
    "SWELL_FOLLOWING",
    "days_since_last_hull_intervention",
    "days_since_last_prop_intervention",
    "cumulative_degree_days_since_hull_cleaning",
    "HOURS_FULL_SPEED",
    "fuel_lcv",
    "day",
    "day_sin",
    "day_cos",
]
CATEGORICAL = ["ship_id", "ship_class", "fuel_used"]
FEATURE_COLUMNS = BASE_NUMERIC + CATEGORICAL
FOULING_FEATURES = (
    "days_since_last_hull_intervention",
    "days_since_last_prop_intervention",
    "cumulative_degree_days_since_hull_cleaning",
)


@dataclass(frozen=True)
class FeatureSet:
    frame: pd.DataFrame
    feature_columns: tuple[str, ...]

    @property
    def training_rows(self) -> pd.DataFrame:
        return self.frame.loc[self.frame["is_trainable"]].copy()

    @property
    def predict_rows(self) -> pd.DataFrame:
        return self.frame.loc[self.frame["is_predict"]].copy()


def _direction_components(
    frame: pd.DataFrame, prefix: str, magnitude: str, direction: str
) -> None:
    angle = pd.to_numeric(frame[direction], errors="coerce")
    usable = angle.where(angle.between(0, 360))
    radians = np.deg2rad(usable)
    mag = pd.to_numeric(frame[magnitude], errors="coerce")
    axial = mag * np.cos(radians)
    frame[f"{prefix}_HEAD"] = axial.clip(lower=0)
    frame[f"{prefix}_FOLLOWING"] = (-axial).clip(lower=0)
    frame[f"{prefix}_BEAM"] = mag * np.abs(np.sin(radians))


def _state_features(
    frame: pd.DataFrame, events: pd.DataFrame
) -> tuple[pd.Series, pd.Series, pd.Series]:
    hull_days = pd.Series(np.nan, index=frame.index, dtype=float)
    prop_days = pd.Series(np.nan, index=frame.index, dtype=float)
    degree_days = pd.Series(np.nan, index=frame.index, dtype=float)

    for ship_id, group in frame.groupby("ship_id", sort=False):
        ship_events = events.loc[events["ship_id"].eq(ship_id)].sort_values("event_day")
        hull_events = ship_events.loc[
            ship_events["event_type"].isin(HULL_INTERVENTIONS), "event_day"
        ].to_numpy()
        prop_events = ship_events.loc[
            ship_events["event_type"].isin(PROP_INTERVENTIONS), "event_day"
        ].to_numpy()
        ordered = group.sort_values(["day", "_row_id"])
        temperature = ordered["SEA_WATER_TEMP"].clip(lower=0)
        fallback_temp = (
            float(temperature.median()) if temperature.notna().any() else 0.0
        )
        last_day: float | None = None
        cumulative = 0.0
        last_hull_for_accum: float | None = None
        for idx, row in ordered.iterrows():
            day = float(row["day"])
            previous_hull = hull_events[hull_events <= day]
            previous_prop = prop_events[prop_events <= day]
            hull_day = float(previous_hull[-1]) if len(previous_hull) else np.nan
            prop_day = float(previous_prop[-1]) if len(previous_prop) else np.nan
            hull_days.at[idx] = day - hull_day if np.isfinite(hull_day) else np.nan
            prop_days.at[idx] = day - prop_day if np.isfinite(prop_day) else np.nan

            if np.isfinite(hull_day) and hull_day != last_hull_for_accum:
                cumulative = max(0.0, day - hull_day) * (
                    float(row["SEA_WATER_TEMP"])
                    if pd.notna(row["SEA_WATER_TEMP"])
                    else fallback_temp
                )
                last_hull_for_accum = hull_day
            elif last_day is not None:
                delta = max(0.0, day - last_day)
                temp = (
                    float(row["SEA_WATER_TEMP"])
                    if pd.notna(row["SEA_WATER_TEMP"])
                    else fallback_temp
                )
                cumulative += delta * temp
            elif not np.isfinite(hull_day):
                cumulative = day * (
                    float(row["SEA_WATER_TEMP"])
                    if pd.notna(row["SEA_WATER_TEMP"])
                    else fallback_temp
                )
            degree_days.at[idx] = cumulative
            last_day = day
    return hull_days, prop_days, degree_days


def build_features(dataset: Dataset, anchor: AnchorSolution) -> FeatureSet:
    frame = dataset.voyages.copy()
    frame["MID_DRAFT"] = frame["MID_DRAFT"].fillna(
        frame[["FORE_DRAFT", "AFTER_DRAFT"]].mean(axis=1)
    )
    frame["DRAFT_MEAN"] = frame[["FORE_DRAFT", "AFTER_DRAFT"]].mean(axis=1)
    frame["STW_CUBED"] = frame["SPEED_THROUGH_WATER"].pow(3)
    _direction_components(frame, "WIND", "WIND_SPEED", "WIND_DIRECTION")
    _direction_components(frame, "SEA", "SEA_HEIGHT", "SEA_DIRECTION")
    _direction_components(frame, "SWELL", "SWELL_HEIGHT", "SWELL_DIRECTION")

    events = maintenance_with_relative_days(dataset.maintenance, anchor)
    hull, prop, degree = _state_features(frame, events)
    frame["days_since_last_hull_intervention"] = hull
    frame["days_since_last_prop_intervention"] = prop
    frame["cumulative_degree_days_since_hull_cleaning"] = degree
    ship_number = frame["ship_id"].str.extract(r"(\d+)", expand=False).astype(float)
    frame["ship_class"] = np.where(
        ship_number.isin([1, 2, 3, 4, 5, 6, 7, 8, 21]), "W1", "W2"
    )
    frame["day_sin"] = np.sin(2 * np.pi * frame["day"] / 365.25)
    frame["day_cos"] = np.cos(2 * np.pi * frame["day"] / 365.25)

    hours = frame["HOURS_FULL_SPEED"]
    frame["target_equiv_mass"] = frame["_visible_fuel_equiv"].where(
        frame["_visible_fuel_mass"].gt(0)
    )
    frame["target_rate"] = frame["target_equiv_mass"].div(hours.where(hours.gt(0)))
    frame["target_raw_mass"] = frame["_visible_fuel_mass"].where(
        frame["_fuel_count"].eq(1)
    )
    frame["is_qualified"] = hours.ge(22) & frame["WIND_SCALE"].le(4)
    frame["is_trainable"] = (
        frame["is_qualified"]
        & frame["target_rate"].notna()
        & np.isfinite(frame["target_rate"])
        & frame["target_rate"].gt(0)
    )
    frame["is_predict"] = frame["_has_predict"]
    # PREDICT rows have one requested fuel and official LCV.
    for fuel, lcv in LCV_BY_FUEL.items():
        frame.loc[frame["_predict_fuel"].eq(fuel), "fuel_lcv"] = lcv
    if frame.loc[frame["is_predict"], "fuel_lcv"].isna().any():
        raise ValueError("PREDICT row missing requested fuel LCV")
    return FeatureSet(frame=frame, feature_columns=tuple(FEATURE_COLUMNS))
