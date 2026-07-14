"""Command-line orchestration for anchor, validation, fitting, and submission."""

from __future__ import annotations

import argparse
from pathlib import Path

from .anchor import solve_anchor
from .features import build_features
from .load import load_dataset
from .models import BlendModel, GBMModel, PhysicsBaseline
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
    parser.add_argument("--model", choices=["physics", "gbm", "blend"], default="blend")
    parser.add_argument("command", choices=["all"], nargs="?", default="all")
    return parser


def run_all(data_dir: str, model_name: str) -> Path:
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
    print(f"\nSelected blend GBM weight: {validation.blend_weight:.2f}")

    training = features.training_rows
    physics = PhysicsBaseline().fit(training)
    gbm = GBMModel().fit(training)
    blend = BlendModel(physics, gbm, validation.blend_weight)
    selected = {"physics": physics, "gbm": gbm, "blend": blend}[model_name]

    predictions = predict_submission_rows(selected, features.predict_rows)
    project_dir = Path(__file__).resolve().parents[2]
    destination = write_submission(
        predictions,
        dataset.predict_cells,
        project_dir / "output" / "submission.csv",
    )

    simulated = validation.comparison.loc[
        validation.comparison["evaluation"].eq("SimulatedMask")
    ]
    best = simulated.loc[simulated["RMSE_MT"].idxmin()]
    print("\nTop-10 permutation feature importances (held-out simulated masks)")
    print(
        validation.feature_importances.head(10).to_string(
            index=False, float_format=lambda x: f"{x:.6f}"
        )
    )
    print("\nFinal summary")
    print(
        f"  anchor: {anchor.mode}; global exact {anchor.exact_global_matches}/14; "
        f"fallback {anchor.fallback_aligned_count}/14"
    )
    print(
        f"  best simulated-mask model: {best['model']} "
        f"RMSE={best['RMSE_MT']:.4f} MT, MAPE={best['MAPE_pct']:.4f}%"
    )
    print(f"  submission model: {model_name}; rows=102; path={destination}")
    return destination


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    run_all(args.data_dir, args.model)
