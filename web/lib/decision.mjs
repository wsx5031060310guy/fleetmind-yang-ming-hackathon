import { baseSummaries } from "./demo-data.mjs";

export const ALERT_HORIZON_DAYS = 30;

function forecast(current, threshold, slope, lowConfidence) {
  if (!Number.isFinite(current)) {
    return { daysToThreshold: null, projectedCrossValuePct: null, lowConfidence: true };
  }
  if (current >= threshold) {
    return {
      daysToThreshold: 0,
      projectedCrossValuePct: current,
      lowConfidence
    };
  }
  if (!Number.isFinite(slope) || slope <= 0) {
    return { daysToThreshold: null, projectedCrossValuePct: null, lowConfidence };
  }
  const exactDays = (threshold - current) / slope;
  if (!Number.isFinite(exactDays) || exactDays > 2147483647) {
    return { daysToThreshold: null, projectedCrossValuePct: null, lowConfidence: true };
  }
  const daysToThreshold = Math.max(1, Math.ceil(exactDays));
  return {
    daysToThreshold,
    projectedCrossValuePct: current + slope * daysToThreshold,
    lowConfidence
  };
}

function recommendation(summary, threshold, forecastResult) {
  const lowConfidence = summary.confidence?.trim().toUpperCase() === "LOW";
  if (Number.isFinite(summary.latestSpeedLossPct) && summary.latestSpeedLossPct >= threshold) {
    if (Number.isFinite(summary.foulingAttributionPct)
        && summary.foulingAttributionPct >= 70 && !lowConfidence) {
      return {
        status: "ACT",
        recommendedAction: "RECOMMEND_CLEANING",
        rationale: "已達門檻且船體污損歸因高；先安排 UWILD 確認，再規劃船體清洗。"
      };
    }
    return {
      status: "ACT",
      recommendedAction: "SCHEDULE_UWILD",
      rationale: "已達門檻；先安排低成本 UWILD 檢查，依檢查證據決定是否清洗。"
    };
  }
  if (forecastResult.daysToThreshold !== null
      && forecastResult.daysToThreshold >= 0
      && forecastResult.daysToThreshold <= ALERT_HORIZON_DAYS) {
    return {
      status: "WATCH",
      recommendedAction: "SCHEDULE_UWILD",
      rationale: "預估於警戒期內跨越門檻；先排程 UWILD，不將檢查視為清洗。"
    };
  }
  return {
    status: "NORMAL",
    recommendedAction: "OBSERVE",
    rationale: "目前低於門檻，且警戒期內無跨越預測；持續觀察。"
  };
}

export function summaries(threshold) {
  return baseSummaries().map((summary) => {
    const projected = forecast(summary.latestSpeedLossPct, threshold,
      summary.trendSlopePctPerDay, summary.forecastLowConfidence === true);
    const advised = recommendation(summary, threshold, projected);
    return {
      vesselId: summary.vesselId,
      latestSpeedLossPct: summary.latestSpeedLossPct,
      foulingAttributionPct: summary.foulingAttributionPct,
      confidence: summary.confidence,
      sampleDays: summary.sampleDays,
      daysSinceLastCleaning: summary.daysSinceLastCleaning,
      dataQualityScore: summary.dataQualityScore,
      reviewPriority: summary.reviewPriority,
      thresholdPct: threshold,
      forecastDaysToThreshold: projected.daysToThreshold,
      projectedCrossValuePct: projected.projectedCrossValuePct,
      status: advised.status,
      recommendedAction: advised.recommendedAction,
      rationale: advised.rationale,
      cleaningsSinceDryDock: summary.cleaningsSinceDryDock,
      daysSinceDryDock: summary.daysSinceDryDock,
      cleaningEffectiveness: summary.cleaningEffectiveness,
      fuelPenaltyPct: summary.fuelPenaltyPct,
      activeFuelType: summary.activeFuelType,
      estimatedAnnualExcessFuelMt: summary.estimatedAnnualExcessFuelMt,
      trendSlopePctPerDay: summary.trendSlopePctPerDay,
      forecastLowConfidence: projected.lowConfidence
    };
  });
}

export function decisionFromSummary(summary) {
  return {
    vesselId: summary.vesselId,
    thresholdPct: summary.thresholdPct,
    currentSpeedLossPct: summary.latestSpeedLossPct,
    forecastDaysToThreshold: summary.forecastDaysToThreshold,
    projectedCrossValuePct: summary.projectedCrossValuePct,
    status: summary.status,
    recommendedAction: summary.recommendedAction,
    rationale: summary.rationale,
    alertHorizonDays: ALERT_HORIZON_DAYS,
    cleaningsSinceDryDock: summary.cleaningsSinceDryDock,
    daysSinceDryDock: summary.daysSinceDryDock,
    cleaningEffectiveness: summary.cleaningEffectiveness,
    fuelPenaltyPct: summary.fuelPenaltyPct,
    activeFuelType: summary.activeFuelType,
    estimatedAnnualExcessFuelMt: summary.estimatedAnnualExcessFuelMt,
    confidence: summary.confidence
  };
}

export function decision(vesselId, threshold) {
  const summary = summaries(threshold).find((candidate) => candidate.vesselId === vesselId);
  if (!summary) throw new Error(`unknown vessel: ${vesselId}`);
  return decisionFromSummary(summary);
}

export function alerts(threshold) {
  const severity = { ACT: 0, WATCH: 1 };
  return summaries(threshold)
    .filter((summary) => summary.status === "ACT" || summary.status === "WATCH")
    .sort((left, right) => severity[left.status] - severity[right.status]
      || right.latestSpeedLossPct - left.latestSpeedLossPct
      || (left.forecastDaysToThreshold ?? 2147483647)
        - (right.forecastDaysToThreshold ?? 2147483647)
      || left.vesselId.localeCompare(right.vesselId))
    .map(decisionFromSummary);
}
