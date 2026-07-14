"""Optional local external-reanalysis join; never fetches network data."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

EXTERNAL_VALUE_COLUMNS = (
    "external_sst_c",
    "external_current_u_ms",
    "external_current_v_ms",
)


def join_external_reanalysis(
    voyages: pd.DataFrame,
    external_path: str | Path,
    noon_date_column: str = "NOON_DATE",
) -> tuple[pd.DataFrame, tuple[str, ...]]:
    """Join a pre-fetched daily SST/current CSV by absolute noon date.

    Expected external columns: ``date`` and one or more numeric columns from
    ``EXTERNAL_VALUE_COLUMNS``. If ``ship_id`` is present, join by ship and date;
    otherwise one unique reanalysis row per date is required. Current organizer
    data exposes only relative ``NOON_UTC`` days, so callers must first supply an
    absolute ``NOON_DATE`` mapping. No network call exists in this hook.
    """

    if noon_date_column not in voyages.columns:
        raise ValueError(
            f"--use-external requires absolute {noon_date_column}; "
            "relative NOON_UTC alone cannot join public reanalysis dates"
        )
    source = Path(external_path)
    if not source.is_file():
        raise FileNotFoundError(f"external reanalysis CSV not found: {source}")
    external = pd.read_csv(source)
    if "date" not in external.columns:
        raise ValueError("external reanalysis CSV missing date column")
    value_columns = tuple(
        column for column in EXTERNAL_VALUE_COLUMNS if column in external.columns
    )
    if not value_columns:
        raise ValueError(
            "external reanalysis CSV needs external_sst_c and/or current components"
        )
    key_columns = ["ship_id"] if "ship_id" in external.columns else []
    external = external[[*key_columns, "date", *value_columns]].copy()
    external["_external_date"] = pd.to_datetime(
        external.pop("date"), errors="coerce", utc=True
    ).dt.date
    if external["_external_date"].isna().any():
        raise ValueError("external reanalysis CSV contains invalid date")
    for column in value_columns:
        external[column] = pd.to_numeric(external[column], errors="coerce")
        external[column] = external[column].where(np.isfinite(external[column]))

    result = voyages.copy()
    result["_external_date"] = pd.to_datetime(
        result[noon_date_column], errors="coerce", utc=True
    ).dt.date
    if result["_external_date"].isna().any():
        raise ValueError(f"voyage {noon_date_column} contains invalid date")
    join_keys = ["_external_date"]
    if "ship_id" in external.columns:
        join_keys.insert(0, "ship_id")
    if external.duplicated(join_keys).any():
        raise ValueError(f"external reanalysis keys must be unique: {join_keys}")
    result = result.merge(
        external,
        on=join_keys,
        how="left",
        validate="many_to_one",
        sort=False,
    ).drop(columns="_external_date")
    if {
        "external_current_u_ms",
        "external_current_v_ms",
    }.issubset(value_columns):
        result["external_current_speed_ms"] = np.hypot(
            result["external_current_u_ms"], result["external_current_v_ms"]
        )
        value_columns = (*value_columns, "external_current_speed_ms")
    return result, value_columns
