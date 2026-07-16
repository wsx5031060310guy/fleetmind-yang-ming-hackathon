"""Strict one-to-one submission construction and writing."""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path
from typing import Mapping

import numpy as np
import pandas as pd

SUBMISSION_COLUMNS = ["ship_id", "day", "fuel_type", "predicted_value"]
CONFIDENCE_COLUMNS = [*SUBMISSION_COLUMNS, "pred_lo", "pred_hi"]


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


def _assert_plausible_predictions(
    predictions: pd.DataFrame,
    ship_visible_max: Mapping[str, float],
    multiplier: float = 1.5,
) -> None:
    violations: list[str] = []
    for row in predictions.itertuples(index=False):
        ship_id = str(row.ship_id)
        visible_max = float(ship_visible_max.get(ship_id, np.nan))
        limit = visible_max * multiplier
        value = float(row.predicted_value)
        if not np.isfinite(limit) or visible_max <= 0:
            violations.append(f"{ship_id} missing positive visible maximum")
        elif value > limit:
            violations.append(
                f"{ship_id} day={int(row.day)} fuel={row.fuel_type} "
                f"predicted_value={value:.6f} limit={limit:.6f}"
            )
    if violations:
        detail = "; ".join(violations)
        raise ValueError(f"refusing submission: physically implausible cell(s): {detail}")

    # The bound above is one-sided: it only catches cells that are too HIGH. Every PREDICT cell
    # is a day with >=22h at full speed (docs/22 §4), so a value far BELOW the ship's own median
    # is just as impossible — you cannot run the main engine at full speed for 22 hours on 2.5 MT.
    # The 2026-07-14 submission has four such cells (S21 day 960/961/962 and 1008; the lowest is
    # 2.45 MT against a fleet median of 86.92) and they sailed straight through.
    #
    # A warning, not a raise: this is written without the dataset to hand, so the threshold is
    # not calibrated and must never be able to block a submission on its own. Someone with data/
    # should check those cells' HOURS_FULL_SPEED and decide whether the bound belongs here.
    for ship_id, group in predictions.groupby("ship_id"):
        med = float(group["predicted_value"].median())
        if med <= 0:
            continue
        low = group[group["predicted_value"] < med * 0.25]
        for row in low.itertuples(index=False):
            print(
                f"WARNING: {ship_id} day={int(row.day)} fuel={row.fuel_type} "
                f"predicted_value={float(row.predicted_value):.2f} is under 25% of this ship's "
                f"median ({med:.2f}) — a >=22h full-speed day cannot burn that little. Check it.",
                file=sys.stderr,
            )


def attach_prediction_confidence(
    predictions: pd.DataFrame,
    predict_rows: pd.DataFrame,
    residual_std: pd.DataFrame,
    overall_residual_std: float,
) -> pd.DataFrame:
    """Attach a ±1 residual-standard-deviation band to submitted cells."""

    row_class = predict_rows.set_index("_row_id")["ship_class"]
    lookup = residual_std.set_index(["ship_class", "fuel_type"])[
        "residual_std_mt"
    ]
    result = predictions.copy()
    classes = result["_row_id"].map(row_class)
    sigmas = np.asarray(
        [
            lookup.get((ship_class, fuel_type), overall_residual_std)
            for ship_class, fuel_type in zip(classes, result["fuel_type"])
        ],
        dtype=float,
    )
    if not np.isfinite(sigmas).all() or np.any(sigmas <= 0):
        raise ValueError("invalid residual standard deviation for confidence bands")
    values = result["predicted_value"].to_numpy(dtype=float)
    result["pred_lo"] = np.maximum(1e-6, values - sigmas)
    result["pred_hi"] = values + sigmas
    return result


def write_submission(
    predictions: pd.DataFrame,
    discovered_cells: pd.DataFrame,
    output_path: str | Path,
    expected_count: int = 102,
    *,
    ship_visible_max: Mapping[str, float] | None = None,
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
    if ship_visible_max is None:
        raise ValueError("refusing submission: ship visible maxima are required")
    _assert_plausible_predictions(predictions, ship_visible_max)

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


def write_confidence_submission(
    predictions: pd.DataFrame,
    discovered_cells: pd.DataFrame,
    output_path: str | Path,
    expected_count: int = 102,
) -> Path:
    required_internal = {"_row_id", *CONFIDENCE_COLUMNS}
    missing = required_internal - set(predictions.columns)
    if missing:
        raise ValueError(f"confidence frame missing columns: {sorted(missing)}")
    if len(predictions) != expected_count or len(discovered_cells) != expected_count:
        raise ValueError(
            f"refusing confidence output: expected {expected_count} cells, "
            f"predictions={len(predictions)}, discovered={len(discovered_cells)}"
        )
    if _cell_counter(predictions) != _cell_counter(discovered_cells):
        raise ValueError(
            "refusing confidence output: predictions do not match PREDICT cells 1:1"
        )
    numeric = predictions[["predicted_value", "pred_lo", "pred_hi"]].apply(
        pd.to_numeric, errors="coerce"
    )
    if not np.isfinite(numeric.to_numpy()).all():
        raise ValueError("refusing confidence output: values must be finite")
    if numeric["pred_lo"].le(0).any() or not (
        numeric["pred_lo"].le(numeric["predicted_value"])
        & numeric["predicted_value"].le(numeric["pred_hi"])
    ).all():
        raise ValueError("refusing confidence output: invalid prediction band")

    result = predictions[CONFIDENCE_COLUMNS].copy()
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
        destination, index=False, float_format="%.6f", columns=CONFIDENCE_COLUMNS
    )
    return destination
