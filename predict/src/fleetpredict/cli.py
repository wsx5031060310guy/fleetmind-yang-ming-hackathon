"""Command-line orchestration for event mapping, model selection, and submission."""

from __future__ import annotations

import argparse
from pathlib import Path

from .anchor import solve_anchor
from .features import build_features
from .load import load_dataset
from .models import GBM_BASELINE_NAME, fit_named_model
from .submit import predict_submission_rows, write_submission
from .validate import validate_models


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fleet fuel-consumption prediction pipeline"
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="directory containing vt_fd.csv and maintenance.csv",
    )
    parser.add_argument("command", choices=["all"], nargs="?", default="all")
    return parser


def run_all(data_dir: str) -> Path:
    dataset = load_dataset(data_dir)
    print(
        f"Loaded {len(dataset.voyages):,} rows, {len(dataset.maintenance)} events, "
        f"{len(dataset.predict_cells)} PREDICT cells from {dataset.data_dir}"
    )
    anchor = solve_anchor(dataset.voyages, dataset.maintenance)
    print("\n" + anchor.report_text())

    features = build_features(dataset, anchor)
    print(
        f"\nFeatures: trainable qualified rows={len(features.training_rows):,}; "
        f"prediction rows={len(features.predict_rows)}"
    )
    validation = validate_models(features, dataset.maintenance, anchor)
    validation.print_report()
    selected_row = validation.comparison.loc[
        validation.comparison["evaluation"].eq("ExtendedSimulatedMask")
        & validation.comparison["model"].eq(validation.selected_model)
    ].iloc[0]
    print(
        f"\nselected model: {validation.selected_model} "
        "(min extended-sim-mask RMSE)"
    )
    print(
        f"  RMSE={selected_row['RMSE_MT']:.4f} MT; "
        f"MAPE={selected_row['MAPE_pct']:.4f}%; "
        f"bias={selected_row['Bias_MT']:.4f} MT"
    )
    print(f"  blend GBM weight: {validation.blend_weight:.2f}")
    if abs(validation.fouling_rmse_delta) < 1e-6:
        fouling_effect = "tied"
    elif validation.fouling_rmse_delta < 0:
        fouling_effect = "improved"
    else:
        fouling_effect = "worsened"
    print(
        "  corrected fouling features: "
        f"{fouling_effect} plain GBM by "
        f"{abs(validation.fouling_rmse_delta):.4f} MT RMSE"
    )

    training = features.training_rows
    selected = fit_named_model(
        validation.selected_model, training, validation.blend_weight
    )

    predictions = predict_submission_rows(selected, features.predict_rows)
    project_dir = Path(__file__).resolve().parents[2]
    destination = write_submission(
        predictions,
        dataset.predict_cells,
        project_dir / "output" / "submission.csv",
    )

    print("\nTop-10 permutation feature importances (held-out simulated masks)")
    print(
        validation.feature_importances.head(10).to_string(
            index=False, float_format=lambda x: f"{x:.6f}"
        )
    )
    print("\nFinal summary")
    print(
        f"  anchor: {anchor.mode}; mapped {anchor.mapped_event_count} events; "
        "calendar/fallback logic removed"
    )
    print(
        f"  selected model: {validation.selected_model}; "
        f"extended RMSE={selected_row['RMSE_MT']:.4f} MT, "
        f"MAPE={selected_row['MAPE_pct']:.4f}%"
    )
    baseline_note = (
        "baseline retained"
        if validation.selected_model == GBM_BASELINE_NAME
        else "baseline beaten"
    )
    print(f"  corrected fouling result: {fouling_effect}; {baseline_note}")
    print(f"  submission rows=102; path={destination}")
    return destination


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    run_all(args.data_dir)
