# FleetPredict — WP-P1 fuel-consumption pipeline

Python 3.12 + pandas/numpy/scikit-learn pipeline for 102 official `PREDICT`
cells. Output semantics match raw `ME_FULLSPEED_CONSUMP_*`: fuel consumed
during that day's full-speed period (MT), not 24-hour-normalized Daily FOC.

## Run

From repository root:

```bash
cd predict
UV_CACHE_DIR=/tmp/uv-cache uv run python -m fleetpredict all
UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests -q
```

`--data-dir` defaults to `data`; when run inside `predict/`, loader also resolves
the sibling repository `../data`. Model choices: `--model physics|gbm|blend`.
Default `blend` writes `output/submission.csv` with exactly:

```text
ship_id,day,fuel_type,predicted_value
```

Writer validates all 102 discovered cells one-to-one using internal source-row
identity, checks positive finite values, sorts ship/day, and formats six decimals.
It refuses partial or mismatched output.

## Calendar ↔ relative-day anchor finding

Each predict-ship maintenance event was paired chronologically with one contiguous
masked row block (14 events ↔ 14 blocks). Exact alignment defines:
`masked_start_day = event_relative_day + 1`.

- No single global anchor works for every block.
- No consistent per-ship anchor works either.
- The 14 implied Day-0 dates span `2020-12-24` through `2021-01-02`.
- Robust best global anchor (mode and median): `2021-01-01`; exact for 7/14.
- Required fallback used: each predict-ship event gets effective day
  `masked_start_day - 1`, yielding 14/14 window alignment.
- Training ships have no masked blocks to identify an exact anchor, so their
  event days use `2021-01-01` with low calendar confidence.

The likely cause is that some masked blocks start several calendar days after the
recorded event, while visible sailing rows may occur in between. Pipeline prints
this finding every run. UWI may define a masked block but never resets hull or
propeller state because inspection is not a physical intervention.

## Data and features

Loader reads strings first, records `PREDICT`/`HIDDEN` masks, then converts markers
to NaN. Empty/bad numeric values also become NaN, never zero. `fuel_used` is the
single positive/PREDICT fuel; multi-fuel visible rows are labelled `MULTI`.

GBM target is VLSFO-equivalent fuel mass per full-speed hour. This retains every
qualified visible row with fuel, including multi-fuel days. Prediction multiplies
rate by `HOURS_FULL_SPEED` and converts equivalent mass back with requested fuel
LCV. HSHFO and VLSFO prediction targets both use 40.2 MJ/kg.

Features cover:

- propulsion: STW, SOG, STW³, RPM, propeller speed, two slips;
- loading: mid/mean draft, displacement, cargo;
- environment: wind, sea, swell, temperature, water depth, numeric directional
  head/beam/following components;
- fouling: days since hull intervention, days since propeller intervention,
  cumulative positive sea-temperature degree-days since hull cleaning;
- identity/energy: ship one-hot, W1/W2 class, fuel type, LCV;
- exposure/time: full-speed hours, relative day, annual harmonics.

Hull clock resets only on UWC/UWC+PP/DD. Propeller clock resets only on
PP/UWI+PP/UWC+PP/DD. UWI alone resets nothing.

## Models

1. `PhysicsBaseline`: target rate = `k × STW³`; k is robust median from same
   ship's earlier trailing 365-day/160-qualified-row window, with sister-class
   fallback.
2. `GBMModel`: `HistGradientBoostingRegressor` on rate/hour, median imputation and
   one-hot categorical features; reconstructed to raw full-speed-period mass.
3. `BlendModel`: physics/GBM weight selected on simulated-mask RMSE.

Counterfactual helper predicts as-is versus setting both intervention clocks and
degree-days to zero. Difference is maintenance-review evidence, not an autonomous
instruction or causal guarantee.

## Leak-controlled validation

Simulated-mask evaluation takes 14 deterministic training-ship maintenance
windows. Each holds out the first 5–10 qualified, single-fuel observations within
45 days after its event. All held-out rows are removed before model fitting.
Plain five-fold GroupKFold by ship separately tests transfer to unseen ships.

| Evaluation | Model | RMSE (MT) | MAPE (%) |
| --- | --- | ---: | ---: |
| SimulatedMask | PhysicsBaseline | 10.3189 | 11.5174 |
| SimulatedMask | GBMModel | **2.8234** | **3.4828** |
| SimulatedMask | BlendModel | **2.8234** | **3.4828** |
| GroupKFoldShip | PhysicsBaseline | 11.5821 | 14.3177 |
| GroupKFoldShip | GBMModel | **4.7624** | **6.7503** |
| GroupKFoldShip | BlendModel | **4.7624** | **6.7503** |

Actual run: 14 windows, 133 held-out rows, 8,192 qualified training rows,
scikit-learn 1.5.2. RMSE-optimal blend weight was `1.00` GBM, so GBM and
Blend rows tie. The selected/default submission remains `blend`; validation,
not a hard-coded preference, determines this result.

Held-out permutation importance top 10 (increase in rate-RMSE scorer):

| Rank | Feature | Importance |
| ---: | --- | ---: |
| 1 | `ME_AVG_RPM` | 0.851376 |
| 2 | `SPEED_THROUGH_WATER` | 0.201359 |
| 3 | `AVG_SPEED` | 0.123474 |
| 4 | `FULL_SPD_STW_SLIP` | 0.014841 |
| 5 | `ship_id` | 0.014261 |
| 6 | `PROPELLER_SPEED` | 0.007920 |
| 7 | `WATER_DEPTH` | 0.003142 |
| 8 | `cumulative_degree_days_since_hull_cleaning` | 0.002998 |
| 9 | `SWELL_HEAD` | 0.002075 |
| 10 | `WIND_HEAD` | 0.001760 |

Runtime target: under three minutes on laptop CPU. Deterministic random seed:
`20260714`. Re-running same inputs produces the same submission.
