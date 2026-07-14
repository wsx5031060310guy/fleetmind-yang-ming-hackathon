"""Solve maintenance calendar dates against per-ship relative days.

Exact alignment means masked_start == mapped_event_day + 1. When neither a
global nor per-ship Day-0 can satisfy every predict window, the official-task
fallback maps each predict-ship event to its paired window start minus one and
uses the robust best global anchor for training ships.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np
import pandas as pd

PREDICT_SHIPS = ("S21", "S22", "S23")


@dataclass(frozen=True)
class AnchorSolution:
    mode: str
    best_global_anchor: pd.Timestamp
    verification: pd.DataFrame
    effective_event_days: dict[int, int]
    exact_global_matches: int

    @property
    def fallback_aligned_count(self) -> int:
        return int(self.verification["fallback_aligned"].sum())

    def event_day(self, event_id: int, event_date: pd.Timestamp) -> int:
        if event_id in self.effective_event_days:
            return self.effective_event_days[event_id]
        return int(
            (pd.Timestamp(event_date).normalize() - self.best_global_anchor).days
        )

    def report_text(self) -> str:
        dates = self.verification["implied_anchor"].dt.strftime("%Y-%m-%d")
        lo, hi = dates.min(), dates.max()
        lines = [
            "Anchor report",
            f"  mode: {self.mode}",
            f"  best global Day-0: {self.best_global_anchor.date()}",
            f"  exact global alignment: {self.exact_global_matches}/14",
            f"  implied Day-0 range: {lo}..{hi}",
            f"  fallback event-window alignment: {self.fallback_aligned_count}/14",
            "  fallback: predict event day = masked-window start - 1; "
            "training ships use best global Day-0 (low calendar confidence)",
        ]
        return "\n".join(lines)


def _masked_runs(voyages: pd.DataFrame, ship_id: str) -> list[dict[str, int]]:
    ship = voyages.loc[voyages["ship_id"].eq(ship_id)].sort_values("_row_id")
    masked = ship.loc[ship["_is_masked_row"]]
    if masked.empty:
        return []
    group = masked["_row_id"].diff().ne(1).cumsum()
    runs: list[dict[str, int]] = []
    for _, run in masked.groupby(group, sort=False):
        first = run.iloc[0]
        last = run.iloc[-1]
        runs.append(
            {
                "start_day": int(first["day"]),
                "end_day": int(last["day"]),
                "start_row_id": int(first["_row_id"]),
                "end_row_id": int(last["_row_id"]),
            }
        )
    return runs


def solve_anchor(voyages: pd.DataFrame, maintenance: pd.DataFrame) -> AnchorSolution:
    records: list[dict[str, object]] = []
    for ship_id in PREDICT_SHIPS:
        events = maintenance.loc[maintenance["ship_id"].eq(ship_id)].sort_values(
            "event_date"
        )
        runs = _masked_runs(voyages, ship_id)
        if len(events) != len(runs):
            raise ValueError(
                f"cannot pair maintenance and masked windows for {ship_id}: "
                f"{len(events)} events vs {len(runs)} windows"
            )
        for (_, event), run in zip(events.iterrows(), runs, strict=True):
            event_date = pd.Timestamp(event["event_date"]).normalize()
            implied = event_date - pd.Timedelta(days=run["start_day"] - 1)
            records.append(
                {
                    "_event_id": int(event["_event_id"]),
                    "ship_id": ship_id,
                    "event_type": event["event_type"],
                    "event_date": event_date,
                    **run,
                    "implied_anchor": implied,
                }
            )
    verification = (
        pd.DataFrame(records)
        .sort_values(["ship_id", "event_date"])
        .reset_index(drop=True)
    )
    if len(verification) != 14:
        raise ValueError(
            f"expected 14 predict-ship events/windows, found {len(verification)}"
        )

    counts = Counter(verification["implied_anchor"])
    max_count = max(counts.values())
    modes = sorted(anchor for anchor, count in counts.items() if count == max_count)
    # A tied mode uses median proximity. Dataset resolves to 2021-01-01.
    ordinal_median = float(
        np.median([d.toordinal() for d in verification["implied_anchor"]])
    )
    best = min(modes, key=lambda d: abs(d.toordinal() - ordinal_median))
    verification["global_event_day"] = (
        verification["event_date"] - best
    ).dt.days.astype(int)
    verification["global_exact"] = verification["start_day"].eq(
        verification["global_event_day"] + 1
    )

    per_ship_consistent = (
        verification.groupby("ship_id")["implied_anchor"].nunique().eq(1).all()
    )
    global_consistent = verification["implied_anchor"].nunique() == 1
    if global_consistent:
        mode = "global"
        effective = {}
    elif per_ship_consistent:
        mode = "per_ship"
        effective = {}
    else:
        mode = "window_start_fallback"
        effective = {
            int(row["_event_id"]): int(row["start_day"]) - 1
            for _, row in verification.iterrows()
        }
    verification["effective_event_day"] = verification.apply(
        lambda row: effective.get(int(row["_event_id"]), int(row["global_event_day"])),
        axis=1,
    )
    verification["fallback_aligned"] = verification["start_day"].eq(
        verification["effective_event_day"] + 1
    )
    return AnchorSolution(
        mode=mode,
        best_global_anchor=best,
        verification=verification,
        effective_event_days=effective,
        exact_global_matches=int(verification["global_exact"].sum()),
    )


def maintenance_with_relative_days(
    maintenance: pd.DataFrame, solution: AnchorSolution
) -> pd.DataFrame:
    result = maintenance.copy()
    result["event_day"] = [
        solution.event_day(int(row["_event_id"]), pd.Timestamp(row["event_date"]))
        for _, row in result.iterrows()
    ]
    return result
