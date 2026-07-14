"""Strict loaders for competition CSV files.

Placeholder strings are detected before numeric conversion. They become NaN plus
explicit masks; they are never silently interpreted as zero.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

SHIP_COLUMN = "De-identification Name"
DAY_COLUMN = "NOON_UTC"
FUEL_PREFIX = "ME_FULLSPEED_CONSUMP_"
MARKERS = frozenset({"PREDICT", "HIDDEN"})
LCV_BY_FUEL = {
    f"{FUEL_PREFIX}HSHFO": 40.2,
    f"{FUEL_PREFIX}ULSFO": 41.2,
    f"{FUEL_PREFIX}VLSFO": 40.2,
    f"{FUEL_PREFIX}LSMGO": 42.7,
    f"{FUEL_PREFIX}BIO_HSFO": 39.4,
}


@dataclass(frozen=True)
class Dataset:
    voyages: pd.DataFrame
    maintenance: pd.DataFrame
    predict_cells: pd.DataFrame
    fuel_columns: tuple[str, ...]
    data_dir: Path


def resolve_data_dir(data_dir: str | Path) -> Path:
    requested = Path(data_dir).expanduser()
    candidates = [requested]
    if not requested.is_absolute():
        candidates.extend(
            [
                Path.cwd().parent / requested,
                Path(__file__).resolve().parents[3] / requested,
            ]
        )
    for candidate in candidates:
        if (candidate / "vt_fd.csv").is_file() and (
            candidate / "maintenance.csv"
        ).is_file():
            return candidate.resolve()
    raise FileNotFoundError(
        f"data directory missing vt_fd.csv/maintenance.csv: {requested}"
    )


def _clean_strings(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.apply(lambda col: col.str.strip() if col.dtype == object else col)


def load_dataset(data_dir: str | Path = "data") -> Dataset:
    root = resolve_data_dir(data_dir)
    raw = pd.read_csv(root / "vt_fd.csv", dtype=str, keep_default_na=False)
    raw = _clean_strings(raw)
    fuel_columns = tuple(c for c in raw.columns if c.startswith(FUEL_PREFIX))
    if set(fuel_columns) != set(LCV_BY_FUEL):
        raise ValueError(f"unexpected fuel columns: {fuel_columns}")

    marker_upper = raw.apply(
        lambda col: col.str.upper() if col.dtype == object else col
    )
    predict_mask = marker_upper.eq("PREDICT")
    hidden_mask = marker_upper.eq("HIDDEN")
    marker_mask = predict_mask | hidden_mask

    cells: list[dict[str, object]] = []
    for fuel in fuel_columns:
        for row_id in raw.index[predict_mask[fuel]]:
            cells.append(
                {
                    "_row_id": int(row_id),
                    "ship_id": raw.at[row_id, SHIP_COLUMN],
                    "day": int(float(raw.at[row_id, DAY_COLUMN])),
                    "fuel_type": fuel,
                }
            )
    predict_cells = pd.DataFrame(
        cells, columns=["_row_id", "ship_id", "day", "fuel_type"]
    )

    voyages = raw.mask(marker_mask, np.nan)
    voyages.insert(0, "_row_id", np.arange(len(voyages), dtype=int))
    voyages["ship_id"] = voyages[SHIP_COLUMN].replace("", np.nan)
    voyages["day"] = pd.to_numeric(voyages[DAY_COLUMN], errors="coerce")
    voyages["_is_masked_row"] = marker_mask.any(axis=1).to_numpy()
    voyages["_has_predict"] = predict_mask[list(fuel_columns)].any(axis=1).to_numpy()
    voyages["_predict_fuel"] = pd.Series(pd.NA, index=voyages.index, dtype="object")
    for fuel in fuel_columns:
        voyages.loc[predict_mask[fuel].to_numpy(), "_predict_fuel"] = fuel

    protected = {
        "_row_id",
        "ship_id",
        SHIP_COLUMN,
        "VOYAGE",
        "_is_masked_row",
        "_has_predict",
        "_predict_fuel",
        "NOON_DATE",
    }
    for column in voyages.columns:
        if column not in protected:
            voyages[column] = pd.to_numeric(voyages[column], errors="coerce")

    fuel_values = voyages[list(fuel_columns)].fillna(0.0).clip(lower=0.0)
    positive = fuel_values.gt(0.0)
    positive_count = positive.sum(axis=1)
    single_name = positive.idxmax(axis=1).where(positive_count.eq(1))
    voyages["fuel_used"] = single_name
    voyages.loc[positive_count.gt(1), "fuel_used"] = "MULTI"
    voyages.loc[voyages["_has_predict"], "fuel_used"] = voyages.loc[
        voyages["_has_predict"], "_predict_fuel"
    ]
    voyages["_fuel_count"] = positive_count.astype(int)

    mass = fuel_values.sum(axis=1)
    energy = sum(fuel_values[fuel] * LCV_BY_FUEL[fuel] for fuel in fuel_columns)
    voyages["_visible_fuel_mass"] = mass
    voyages["_visible_fuel_equiv"] = energy / 40.2
    weighted_lcv = energy.div(mass.where(mass.gt(0)))
    voyages["fuel_lcv"] = weighted_lcv
    for fuel, lcv in LCV_BY_FUEL.items():
        voyages.loc[voyages["fuel_used"].eq(fuel), "fuel_lcv"] = lcv

    maintenance = pd.read_csv(
        root / "maintenance.csv", dtype=str, keep_default_na=False
    )
    maintenance = _clean_strings(maintenance)
    if "event_day" not in maintenance.columns:
        raise ValueError("maintenance.csv missing required event_day")
    event_day = pd.to_numeric(maintenance["event_day"], errors="coerce")
    if event_day.isna().any() or not np.isfinite(event_day).all():
        raise ValueError("maintenance.csv contains unparseable event_day")
    if not event_day.eq(np.floor(event_day)).all():
        raise ValueError("maintenance.csv event_day must contain integers")
    maintenance["event_day"] = event_day.astype(int)
    maintenance.insert(0, "_event_id", np.arange(len(maintenance), dtype=int))

    return Dataset(voyages, maintenance, predict_cells, fuel_columns, root)
