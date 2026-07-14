"""Maintenance-review counterfactual for dashboard/business storytelling."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class CounterfactualResult:
    ship_id: str
    day: int
    as_is_mt: float
    reset_clocks_mt: float
    savings_mt: float
    savings_pct: float


def maintenance_counterfactual(
    model, rows: pd.DataFrame, ship_id: str, day: int
) -> CounterfactualResult:
    candidates = rows.loc[rows["ship_id"].eq(ship_id) & rows["day"].eq(day)]
    if candidates.empty:
        raise KeyError(f"no row for {ship_id} day {day}")
    row = (
        candidates.sort_values(["is_predict", "_row_id"], ascending=[False, True])
        .head(1)
        .copy()
    )
    as_is = float(model.predict(row)[0])
    reset = row.copy()
    reset["days_since_last_hull_intervention"] = 0.0
    reset["days_since_last_prop_intervention"] = 0.0
    reset["cumulative_degree_days_since_hull_cleaning"] = 0.0
    reset_value = float(model.predict(reset)[0])
    savings = as_is - reset_value
    savings_pct = 100.0 * savings / as_is if as_is else 0.0
    return CounterfactualResult(ship_id, day, as_is, reset_value, savings, savings_pct)
