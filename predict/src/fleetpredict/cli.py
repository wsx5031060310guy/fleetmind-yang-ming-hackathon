"""Command-line orchestration for event mapping, model selection, and submission."""

from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path

from .anchor import solve_anchor
from .external import join_external_reanalysis
from .features import build_features
from .load import load_dataset
from .models import GBM_BASELINE_NAME, fit_named_model
from .submit import (
    attach_prediction_confidence,
    predict_submission_rows,
    write_confidence_submission,
    write_submission,
)
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
    parser.add_argument(
        "--use-external",
        action="store_true",
        help="join a pre-fetched local SST/current CSV; OFF by default",
    )
    parser.add_argument(
        "--external-path",
        help="local external CSV (default: DATA_DIR/external-reanalysis.csv)",
    )
    parser.add_argument("command", choices=["all"], nargs="?", default="all")
    return parser


def run_all(
    data_dir: str,
    use_external: bool = False,
    external_path: str | None = None,
) -> Path:
    dataset = load_dataset(data_dir)
    print(
        f"Loaded {len(dataset.voyages):,} rows, {len(dataset.maintenance)} events, "
        f"{len(dataset.predict_cells)} PREDICT cells from {dataset.data_dir}"
    )
    external_feature_columns: tuple[str, ...] = ()
    if use_external:
        source = external_path or str(dataset.data_dir / "external-reanalysis.csv")
        voyages, external_feature_columns = join_external_reanalysis(
            dataset.voyages, source
        )
        dataset = replace(dataset, voyages=voyages)
        print(
            "External features: ON; local-only columns="
            + ",".join(external_feature_columns)
        )
    else:
        print("External features: OFF (default; no network calls)")

    anchor = solve_anchor(dataset.voyages, dataset.maintenance)
    print("\n" + anchor.report_text())

    features = build_features(
        dataset, anchor, external_feature_columns=external_feature_columns
    )
    print(
        f"\nFeatures: trainable qualified rows={len(features.training_rows):,}; "
        f"prediction rows={len(features.predict_rows)}"
    )
    validation = validate_models(features, dataset.maintenance, anchor)
    validation.print_report()
    project_dir = Path(__file__).resolve().parents[2]
    validation_destination = validation.write_report(
        project_dir / "output" / "validation-report.csv"
    )
    print(f"\nPersisted validation report: {validation_destination}")
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
        validation.selected_model,
        training,
        validation.blend_weight,
        features.feature_columns,
    )

    predictions = predict_submission_rows(selected, features.predict_rows)
    confidence_predictions = attach_prediction_confidence(
        predictions,
        features.predict_rows,
        validation.residual_std,
        validation.overall_residual_std,
    )
    ship_visible_max = (
        dataset.voyages.loc[dataset.voyages["_visible_fuel_mass"].gt(0)]
        .groupby("ship_id")["_visible_fuel_mass"]
        .max()
        .to_dict()
    )
    destination = write_submission(
        predictions,
        dataset.predict_cells,
        project_dir / "output" / "submission.csv",
        ship_visible_max=ship_visible_max,
    )
    confidence_destination = write_confidence_submission(
        confidence_predictions,
        dataset.predict_cells,
        project_dir / "output" / "submission-with-confidence.csv",
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
    print(f"  confidence rows=102; path={confidence_destination}")
    print(f"  validation report: {validation_destination}")
    print(
        "  external features: "
        + ("ON (local file only)" if use_external else "OFF (default)")
    )
    return destination


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    run_all(args.data_dir, args.use_external, args.external_path)
