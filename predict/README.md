# FleetPredict — WP-P6a fuel-consumption pipeline

Python 3.12 + pandas/numpy/scikit-learn pipeline for 102 official `PREDICT`
cells. Output semantics match raw `ME_FULLSPEED_CONSUMP_*`: fuel consumed
during that day's full-speed period (MT), not 24-hour-normalized Daily FOC.

## Run

From repository root:

```bash
cd predict
uv run python -m fleetpredict all
uv run pytest tests -q
```

`--data-dir` defaults to `data`; when run inside `predict/`, loader also resolves
the sibling repository `../data`.

Model choice is automatic. Extended simulated-mask RMSE selects the submission
model; MAPE breaks an RMSE tie. Pipeline prints
`selected model: <name> (min extended-sim-mask RMSE)` and writes
`output/submission.csv` using that model.

Writer requires exactly:

```text
ship_id,day,fuel_type,predicted_value
```

All 102 discovered cells are checked one-to-one using internal source-row
identity. Values must be positive and finite. Output sorts by ship/day, formats
six decimals, and refuses partial or mismatched submissions.

## Direct maintenance event-day join

Corrected organizer dataset supplies `maintenance.event_day` on the same
per-ship relative axis as `vt_fd.NOON_UTC`:

```text
(ship_id, maintenance.event_day) == (ship_id, vt_fd.NOON_UTC)
```

No calendar parsing, global Day-0 fitting, per-ship anchor search, or masked-window
fallback remains. Pipeline verifies 77 mapped events and reports how many of the
14 predict-ship events fall inside a masked block (current data: 1/14). This is a
diagnostic only; exact event placement always comes from `event_day`.

Fouling state uses exact placement:

- hull clock resets on UWC/UWC+PP/DD;
- propeller clock resets on PP/UWI+PP/UWC+PP/DD;
- cumulative positive sea-temperature degree-days resets on hull intervention;
- UWI alone resets nothing.

## Target semantics and features

Model target is VLSFO-equivalent fuel mass per full-speed hour. This retains every
qualified visible row with fuel, including multi-fuel days. Prediction reconstructs
full-speed-period mass:

```text
predicted raw fuel mass
  = predicted VLSFO-equivalent rate/hour
  × HOURS_FULL_SPEED
  × 40.2 / requested fuel LCV
```

HSHFO and VLSFO both use 40.2 MJ/kg. Test suite asserts that single-fuel
HSHFO/VLSFO visible rows reconstruct their raw full-speed-period mass exactly.

Features cover propulsion, loading, environment, numeric directional components,
ship/fuel identity, hours, relative/seasonal time, and the exact hull/propeller
fouling clocks. Missing values use training medians; categorical values use
one-hot encoding.

Only physical clipping remains: predictions below zero become a tiny positive
value required by submission format; predictions above each ship's maximum
visible full-speed-period mass × 1.2 are capped. No tighter plausibility clipping
is shipped.

## Data-driven candidate selection

Candidates:

1. `GBM baseline`: plain deterministic HistGradientBoosting model, excluding the
   three fouling-clock features.
2. `GBM + exact fouling`: same GBM plus exact hull/propeller/degree-day clocks.
3. `Physics baseline`: trailing robust `k × STW³` rate model.
4. `Blend`: physics plus exact-fouling GBM; weight fitted on extended masks.

No monotonic constraint is shipped. Earlier complexity was worse; current code
requires measurable extended-mask improvement before replacing plain GBM.

## Leak-controlled validation

Extended simulated-mask evaluation uses every eligible event on S1–S12: first
5–10 qualified single-fuel rows within 45 days after each event, ending before the
next event. All held-out rows are removed before fitting. Corrected data yields
60 windows and 578 held-out rows. Five-fold GroupKFold by ship remains secondary.

### Overall model comparison

| Evaluation | Model | n | RMSE (MT) | MAPE (%) | Bias (MT) |
| --- | --- | ---: | ---: | ---: | ---: |
| Extended simulated mask | **GBM baseline** | 578 | **3.5064** | 5.2171 | 0.6763 |
| Extended simulated mask | GBM + exact fouling | 578 | 3.5263 | **5.0558** | 0.6304 |
| Extended simulated mask | Physics baseline | 578 | 10.2883 | 13.6252 | 1.2259 |
| Extended simulated mask | Blend | 578 | 3.5255 | 5.0677 | 0.6363 |
| GroupKFold by ship | GBM baseline | 6,502 | 4.7621 | **6.7038** | -0.0164 |
| GroupKFold by ship | GBM + exact fouling | 6,502 | 4.7604 | 6.7690 | -0.0168 |
| GroupKFold by ship | Physics baseline | 6,502 | 11.5822 | 14.3193 | 0.8208 |
| GroupKFold by ship | Blend | 6,502 | **4.7566** | 6.7556 | -0.0084 |

Primary protocol selects `GBM baseline`: minimum extended simulated-mask RMSE.
Exact fouling features improve MAPE but worsen RMSE by 0.0199 MT, so added
complexity does not beat incumbent and is not used for submission. GroupKFold's
small blend advantage is secondary and does not override declared selection rule.

### Selected-model extended-mask segments

| Dimension | Segment | n | RMSE (MT) | MAPE (%) | Bias (MT) |
| --- | --- | ---: | ---: | ---: | ---: |
| Fuel | HSHFO | 475 | 3.3735 | 4.1594 | 0.7049 |
| Fuel | VLSFO | 77 | 3.3739 | 10.0108 | 0.5098 |
| Ship class | W1 | 377 | 3.6447 | 5.9696 | 0.6801 |
| Ship class | W2 | 201 | 3.2312 | 3.8056 | 0.6691 |

Remaining 26 held-out rows use BIO_HSFO, LSMGO, or ULSFO; pipeline prints all
fuel segments, every selected-model window, and RMSE/MAPE/bias on each run.

Actual run: 8,192 qualified training rows; scikit-learn 1.9.0; fixed seed
`20260714`. Blend GBM weight: 0.99. Re-running identical inputs produces an
identical selected model and submission.
