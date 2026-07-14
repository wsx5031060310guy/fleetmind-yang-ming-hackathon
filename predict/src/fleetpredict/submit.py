"""Strict one-to-one submission construction and writing."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

SUBMISSION_COLUMNS = ["ship_id", "day", "fuel_type", "predicted_value"]


def predict_submission_rows(model, predict_rows: pd.DataFrame) -> pd.DataFrame:
    if predict_rows.empty:
        raise ValueError("no PREDICT rows discovered")
    predictions = model.predict(predict_rows)
    return pd.DataFrame(
        {
            "_row_id": predict_rows["_row_id"].astype(int).to_numpy(),
            "ship_id": predict_rows["ship_id"].to_numpy(),
            "day": predict_rows["day"].astype(int).to_numpy(),
            "fuel_type": predict_rows["_predict_fuel"].to_numpy(),
            "predicted_value": predictions,
        }
    )


def _cell_counter(frame: pd.DataFrame) -> Counter:
    return Counter(
        (
            int(row["_row_id"]),
            str(row["ship_id"]),
            int(row["day"]),
            str(row["fuel_type"]),
        )
        for _, row in frame.iterrows()
    )


def write_submission(
    predictions: pd.DataFrame,
    discovered_cells: pd.DataFrame,
    output_path: str | Path,
    expected_count: int = 102,
) -> Path:
    required_internal = {"_row_id", *SUBMISSION_COLUMNS}
    missing = required_internal - set(predictions.columns)
    if missing:
        raise ValueError(f"prediction frame missing columns: {sorted(missing)}")
    if len(predictions) != expected_count or len(discovered_cells) != expected_count:
        raise ValueError(
            f"refusing submission: expected {expected_count} cells, "
            f"predictions={len(predictions)}, discovered={len(discovered_cells)}"
        )
    if _cell_counter(predictions) != _cell_counter(discovered_cells):
        raise ValueError(
            "refusing submission: predictions do not match PREDICT cells 1:1"
        )
    values = pd.to_numeric(predictions["predicted_value"], errors="coerce")
    if not np.isfinite(values).all() or values.le(0).any():
        raise ValueError(
            "refusing submission: predicted_value must be finite and positive"
        )

    result = predictions[SUBMISSION_COLUMNS].copy()
    result["day"] = result["day"].astype(int)
    result["_ship_number"] = (
        result["ship_id"].str.extract(r"(\d+)", expand=False).astype(int)
    )
    result = result.sort_values(
        ["_ship_number", "day", "fuel_type"], kind="stable"
    ).drop(columns="_ship_number")
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(
        destination, index=False, float_format="%.6f", columns=SUBMISSION_COLUMNS
    )

    check = pd.read_csv(destination)
    if list(check.columns) != SUBMISSION_COLUMNS or len(check) != expected_count:
        destination.unlink(missing_ok=True)
        raise RuntimeError("written submission failed post-write shape check")
    return destination
