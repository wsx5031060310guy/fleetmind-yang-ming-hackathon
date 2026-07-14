from pathlib import Path

import pandas as pd
import pytest

from fleetpredict.anchor import solve_anchor
from fleetpredict.load import load_dataset
from fleetpredict.submit import write_submission


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


def test_anchor_verification_report_exists() -> None:
    dataset = load_dataset(DATA_DIR)
    solution = solve_anchor(dataset.voyages, dataset.maintenance)
    assert len(solution.verification) == 14
    assert solution.mode == "window_start_fallback"
    assert solution.fallback_aligned_count == 14
    assert "Anchor report" in solution.report_text()


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
