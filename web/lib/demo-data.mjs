export const VESSEL_IDS = Object.freeze(["YM-DEMO-01", "YM-DEMO-02", "YM-DEMO-03"]);

// Deliberate Vercel safety boundary: FLEETMIND_METRICS_FILE is never consulted.
// Even when the variable is present, this module exposes only synthetic fixtures.

const BASE_SUMMARIES = Object.freeze([
  baseSummary("YM-DEMO-01", 4.76, 68, "HIGH", 37, 37, 92, 1,
    0.08, 15.7, 1, 420, "FRESH", "VLSFO"),
  baseSummary("YM-DEMO-02", 2.1, 41, "MEDIUM", 24, 84, 88, 2,
    0.02, 6.7, 2, 700, "DIMINISHING", "HFO"),
  baseSummary("YM-DEMO-03", 0, 0, "LOW", 12, 12, 75, 3,
    -0.01, 0, 4, null, "DEPLETED", "BLSF")
]);

const PERFORMANCE = Object.freeze({
  "YM-DEMO-01": Object.freeze([
    metric("YM-DEMO-01", "2025-01-01", 58, 0.00725, 0),
    metric("YM-DEMO-01", "2025-02-01", 59.4, 0.00743, 1.92),
    metric("YM-DEMO-01", "2025-03-01", 61, 0.00763, 4.76, "HIGH_WIND"),
    metric("YM-DEMO-01", "2025-04-01", 57.8, 0.00722, -0.2),
    metric("YM-DEMO-01", "2025-05-01", 58.8, 0.00735, 1.45),
    metric("YM-DEMO-01", "2025-06-01", 61, 0.00763, 4.76)
  ]),
  "YM-DEMO-02": Object.freeze([
    metric("YM-DEMO-02", "2025-01-01", 54.1, 0.00691, 0.3),
    metric("YM-DEMO-02", "2025-02-01", 55, 0.00702, 1.1),
    metric("YM-DEMO-02", "2025-03-01", 55.7, 0.0071, 1.8, "MISSING_WIND_SCALE"),
    metric("YM-DEMO-02", "2025-04-01", 53.9, 0.00688, 0.15),
    metric("YM-DEMO-02", "2025-05-01", 55.9, 0.00713, 2.1)
  ]),
  "YM-DEMO-03": Object.freeze([
    metric("YM-DEMO-03", "2025-01-01", 47, 0.0064, 0, "INSUFFICIENT_FULL_SPEED_HOURS"),
    metric("YM-DEMO-03", "2025-02-01", 47.4, 0.00645, 0.45),
    metric("YM-DEMO-03", "2025-03-01", 48.1, 0.00655, 1.2, "HIGH_WIND"),
    metric("YM-DEMO-03", "2025-04-01", 46.9, 0.00639, -0.1),
    metric("YM-DEMO-03", "2025-05-01", 47, 0.0064, 0)
  ])
});

function baseSummary(vesselId, speedLoss, hullPct, confidence, sampleDays,
  daysSinceCleaning, qualityScore, priority, slope, fuelPenalty,
  cleaningsSinceDryDock, daysSinceDryDock, cleaningEffectiveness, fuelType) {
  return Object.freeze({
    vesselId,
    latestSpeedLossPct: speedLoss,
    foulingAttributionPct: hullPct,
    confidence,
    sampleDays,
    daysSinceLastCleaning: daysSinceCleaning,
    dataQualityScore: qualityScore,
    reviewPriority: priority,
    cleaningsSinceDryDock,
    daysSinceDryDock,
    cleaningEffectiveness,
    fuelPenaltyPct: fuelPenalty,
    activeFuelType: fuelType,
    estimatedAnnualExcessFuelMt: fuelPenalty <= 0 ? 0 : fuelPenalty * 10,
    trendSlopePctPerDay: slope,
    forecastLowConfidence: false
  });
}

function metric(vesselId, date, dailyFoc, kValue, speedLossPct, ...qualityFlags) {
  return Object.freeze({
    vesselId,
    date,
    dailyFoc,
    kValue,
    speedLossPct,
    activeFuelType: "VLSFO",
    qualityFlags: Object.freeze(qualityFlags)
  });
}

export function baseSummaries() {
  return structuredClone(BASE_SUMMARIES);
}

export function performance(vesselId) {
  return structuredClone(PERFORMANCE[vesselId] ?? PERFORMANCE["YM-DEMO-01"]);
}

export function underwaterEvents(vesselId) {
  const suffix = vesselId.slice(vesselId.lastIndexOf("-") + 1);
  return [
    {
      eventId: `event-2025-03-cleaning-${suffix}`,
      vesselId,
      date: "2025-03-15",
      type: "cleaning"
    },
    {
      eventId: `event-2025-04-polishing-${suffix}`,
      vesselId,
      date: "2025-04-10",
      type: "propeller_polishing"
    }
  ];
}

export function beforeAfter(vesselId, eventId = null) {
  let medianKBefore = 0.00763;
  let medianKAfter = 0.00722;
  let focBefore = 61;
  let focAfter = 57.8;
  if (vesselId === "YM-DEMO-02") {
    medianKBefore = 0.0071;
    medianKAfter = 0.00688;
    focBefore = 55.7;
    focAfter = 53.9;
  } else if (vesselId === "YM-DEMO-03") {
    medianKBefore = 0.00655;
    medianKAfter = 0.00639;
    focBefore = 48.1;
    focAfter = 46.9;
  }
  return {
    eventId: eventId ?? underwaterEvents(vesselId)[0].eventId,
    vesselId,
    medianKBefore,
    medianKAfter,
    recoveryPct: (medianKBefore - medianKAfter) / medianKBefore * 100,
    businessImpact: {
      extraFuelMtPerDay: Math.max(0, focBefore - focAfter),
      dailyFuelCostUsd: null,
      annualizedFuelCostUsd: null,
      dailyCo2MetricTons: null,
      annualizedCo2MetricTons: null,
      dailyEuEtsCostUsd: null,
      annualizedEuEtsCostUsd: null,
      dailyAvoidableCostUsd: null,
      paybackDays: null
    }
  };
}

export function dataQuality() {
  return {
    totalRows: 3,
    exportedRows: 3,
    flagCounts: {
      HIGH_WIND: 1,
      INSUFFICIENT_FULL_SPEED_HOURS: 1,
      INVALID_FULL_SPEED_HOURS: 0,
      MISSING_WIND_SCALE: 1
    }
  };
}

export const FUEL_EXPORT = "vessel_id,date,FUEL_CONSUMP,quality_flags\n"
  + "YM-DEMO-01,2025-01-01,24.000000,HIGH_WIND|INSUFFICIENT_FULL_SPEED_HOURS\n"
  + "YM-DEMO-02,2025-01-02,24.000000,\n"
  + "YM-DEMO-03,2025-01-03,18.000000,\n";
