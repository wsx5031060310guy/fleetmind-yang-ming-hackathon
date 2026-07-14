"""Verify the organizer-provided maintenance relative-day mapping.

``maintenance.event_day`` and ``vt_fd.NOON_UTC`` share the same per-ship Day-0.
No calendar parsing, anchor fitting, or masked-window fallback is required.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

PREDICT_SHIPS = ("S21", "S22", "S23")


@dataclass(frozen=True)
class AnchorSolution:
    """Compatibility name for the direct event-day verification result."""

    mode: str
    verification: pd.DataFrame
    event_days: dict[int, int]
    mapped_event_count: int
    predict_event_count: int
    predict_events_in_masked_window: int

    def event_day(self, event_id: int) -> int:
        """Return stored organizer-provided relative day for one event."""

        try:
            return self.event_days[int(event_id)]
        except KeyError as exc:
            raise KeyError(f"unknown maintenance event id: {event_id}") from exc

    def report_text(self) -> str:
        return "\n".join(
            [
                "Maintenance event-day report",
                f"  mode: {self.mode}",
                f"  {self.mapped_event_count} events mapped by event_day; "
                f"{self.predict_events_in_masked_window} land inside predict masked windows",
                f"  predict-ship events: {self.predict_event_count}",
                "  mapping: maintenance.event_day == vt_fd.NOON_UTC "
                "(no calendar anchor or fallback)",
            ]
        )


def _masked_ranges(voyages: pd.DataFrame, ship_id: str) -> list[tuple[int, int]]:
    masked = voyages.loc[
        voyages["ship_id"].eq(ship_id) & voyages["_is_masked_row"]
    ].sort_values("_row_id")
    if masked.empty:
        return []
    groups = masked["_row_id"].diff().ne(1).cumsum()
    return [
        (int(group["day"].min()), int(group["day"].max()))
        for _, group in masked.groupby(groups, sort=False)
    ]


def solve_anchor(voyages: pd.DataFrame, maintenance: pd.DataFrame) -> AnchorSolution:
    """Return a light verification report for the direct relative-day join."""

    required = {"_event_id", "ship_id", "event_type", "event_day"}
    missing = required - set(maintenance.columns)
    if missing:
        raise ValueError(f"maintenance frame missing columns: {sorted(missing)}")

    verification = maintenance[
        ["_event_id", "ship_id", "event_type", "event_day"]
    ].copy()
    verification["event_day"] = verification["event_day"].astype(int)
    verification["is_predict_ship"] = verification["ship_id"].isin(PREDICT_SHIPS)

    ranges_by_ship = {
        ship_id: _masked_ranges(voyages, ship_id) for ship_id in PREDICT_SHIPS
    }
    verification["inside_masked_window"] = [
        bool(
            is_predict
            and any(
                start <= int(event_day) <= end
                for start, end in ranges_by_ship.get(str(ship_id), [])
            )
        )
        for ship_id, event_day, is_predict in verification[
            ["ship_id", "event_day", "is_predict_ship"]
        ].itertuples(index=False, name=None)
    ]
    verification = verification.sort_values(
        ["ship_id", "event_day", "_event_id"], kind="stable"
    ).reset_index(drop=True)
    if verification["_event_id"].duplicated().any():
        raise ValueError("maintenance _event_id must be unique")
    predict_count = int(verification["is_predict_ship"].sum())
    return AnchorSolution(
        mode="direct_event_day",
        verification=verification,
        event_days={
            int(event_id): int(event_day)
            for event_id, event_day in verification[
                ["_event_id", "event_day"]
            ].itertuples(index=False, name=None)
        },
        mapped_event_count=len(verification),
        predict_event_count=predict_count,
        predict_events_in_masked_window=int(
            verification["inside_masked_window"].sum()
        ),
    )


def maintenance_with_relative_days(
    maintenance: pd.DataFrame, solution: AnchorSolution
) -> pd.DataFrame:
    """Join verified integer relative days back by event id and ship."""

    if solution.mapped_event_count != len(maintenance):
        raise ValueError("maintenance rows differ from verified direct mapping")
    mapped = solution.verification[
        ["_event_id", "ship_id", "event_day"]
    ].rename(columns={"event_day": "_mapped_event_day"})
    result = maintenance.drop(columns=["event_day"]).merge(
        mapped,
        on=["_event_id", "ship_id"],
        how="left",
        validate="one_to_one",
        sort=False,
    )
    if result["_mapped_event_day"].isna().any():
        raise ValueError("maintenance event missing verified event_day")
    result["event_day"] = result.pop("_mapped_event_day").astype(int)
    return result
