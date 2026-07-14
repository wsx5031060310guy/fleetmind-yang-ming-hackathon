from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from fleetpredict.anchor import maintenance_with_relative_days, solve_anchor
from fleetpredict.features import _state_features, build_features
from fleetpredict.load import load_dataset
from fleetpredict.models import GBM_BASELINE_NAME, GBM_FOULING_NAME
from fleetpredict.submit import write_submission
from fleetpredict.validate import _select_model


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"


def test_loader_parses_real_files_and_predict_count() -> None:
    dataset = load_dataset(DATA_DIR)
    assert len(dataset.voyages) == 21_282
    assert len(dataset.predict_cells) == 102
    assert (
        dataset.voyages.loc[dataset.voyages["_has_predict"], "_visible_fuel_mass"]
        .eq(0)
        .all()
    )
    assert (
        dataset.voyages.loc[dataset.voyages["_has_predict"], "_predict_fuel"]
        .notna()
        .all()
    )


def test_maintenance_event_day_is_direct_relative_day() -> None:
    dataset = load_dataset(DATA_DIR)
    solution = solve_anchor(dataset.voyages, dataset.maintenance)
    mapped = maintenance_with_relative_days(dataset.maintenance, solution)
    assert solution.mode == "direct_event_day"
    assert solution.mapped_event_count == len(dataset.maintenance)
    assert solution.predict_event_count == 14
    assert "event_date" not in mapped.columns
    assert mapped["event_day"].dtype.kind in "iu"
    assert mapped["event_day"].equals(dataset.maintenance["event_day"])
    first = dataset.maintenance.iloc[0]
    assert solution.event_day(int(first["_event_id"])) == int(first["event_day"])
    assert "no calendar anchor or fallback" in solution.report_text()


def test_fouling_clocks_use_exact_event_day_and_uwi_does_not_reset() -> None:
    frame = pd.DataFrame(
        {
            "_row_id": [0, 1, 2],
            "ship_id": ["S1", "S1", "S1"],
            "day": [10, 15, 20],
            "SEA_WATER_TEMP": [20.0, 20.0, 20.0],
        }
    )
    events = pd.DataFrame(
        {
            "ship_id": ["S1", "S1", "S1"],
            "event_type": ["UWC", "UWI", "PP"],
            "event_day": [10, 15, 20],
        }
    )
    hull, prop, degree_days = _state_features(frame, events)
    assert hull.tolist() == [0.0, 5.0, 10.0]
    assert np.isnan(prop.iloc[0]) and np.isnan(prop.iloc[1])
    assert prop.iloc[2] == 0.0
    assert degree_days.tolist() == [0.0, 100.0, 200.0]


def test_target_is_full_speed_period_mass_reconstructed_from_hourly_rate() -> None:
    dataset = load_dataset(DATA_DIR)
    solution = solve_anchor(dataset.voyages, dataset.maintenance)
    rows = build_features(dataset, solution).training_rows
    same_lcv = rows.loc[
        rows["_fuel_count"].eq(1)
        & rows["fuel_used"].isin(
            [
                "ME_FULLSPEED_CONSUMP_HSHFO",
                "ME_FULLSPEED_CONSUMP_VLSFO",
            ]
        )
    ]
    reconstructed = same_lcv["target_rate"] * same_lcv["HOURS_FULL_SPEED"]
    assert len(same_lcv) > 100
    assert np.allclose(reconstructed, same_lcv["target_raw_mass"])


def test_submission_refuses_wrong_row_count(tmp_path: Path) -> None:
    predictions = pd.DataFrame(
        [
            {
                "_row_id": 1,
                "ship_id": "S21",
                "day": 10,
                "fuel_type": "ME_FULLSPEED_CONSUMP_HSHFO",
                "predicted_value": 50.0,
            }
        ]
    )
    discovered = predictions[["_row_id", "ship_id", "day", "fuel_type"]].copy()
    with pytest.raises(ValueError, match="expected 102"):
        write_submission(predictions, discovered, tmp_path / "bad.csv")
    assert not (tmp_path / "bad.csv").exists()


def test_model_selection_uses_rmse_then_mape() -> None:
    comparison = pd.DataFrame(
        [
            {
                "evaluation": "ExtendedSimulatedMask",
                "model": GBM_BASELINE_NAME,
                "RMSE_MT": 3.5,
                "MAPE_pct": 5.2,
            },
            {
                "evaluation": "ExtendedSimulatedMask",
                "model": GBM_FOULING_NAME,
                "RMSE_MT": 3.5,
                "MAPE_pct": 5.1,
            },
        ]
    )
    assert _select_model(comparison) == GBM_FOULING_NAME
    comparison.loc[
        comparison["model"].eq(GBM_BASELINE_NAME), "RMSE_MT"
    ] = 3.49
    assert _select_model(comparison) == GBM_BASELINE_NAME
