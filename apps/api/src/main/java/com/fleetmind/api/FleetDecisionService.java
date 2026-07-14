package com.fleetmind.api;

import com.fleetmind.corecalc.DecisionSupport;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public final class FleetDecisionService {
    private final FleetDataProvider fleetData;
    private final ThresholdService thresholdService;

    public FleetDecisionService(FleetDataProvider fleetData, ThresholdService thresholdService) {
        this.fleetData = fleetData;
        this.thresholdService = thresholdService;
    }

    public int alertHorizonDays() {
        return DecisionSupport.DEFAULT_ALERT_HORIZON_DAYS;
    }

    public List<VesselSummaryDto> summaries() {
        double threshold = thresholdService.get();
        return fleetData.fleetSummary().stream()
                .map(summary -> applyThreshold(summary, threshold))
                .toList();
    }

    public DecisionDto decision(String vesselId) {
        return summaries().stream()
                .filter(summary -> summary.vesselId().equals(vesselId))
                .findFirst()
                .map(summary -> DecisionDto.from(summary, alertHorizonDays()))
                .orElseThrow(() -> new IllegalArgumentException("unknown vessel: " + vesselId));
    }

    public List<DecisionDto> alerts() {
        return summaries().stream()
                .filter(summary -> "ACT".equals(summary.status()) || "WATCH".equals(summary.status()))
                .sorted(Comparator
                        .comparingInt((VesselSummaryDto summary) -> severity(summary.status()))
                        .thenComparing(Comparator.comparingDouble(
                                VesselSummaryDto::latestSpeedLossPct).reversed())
                        .thenComparing(summary -> summary.forecastDaysToThreshold() == null
                                ? Integer.MAX_VALUE : summary.forecastDaysToThreshold())
                        .thenComparing(VesselSummaryDto::vesselId))
                .map(summary -> DecisionDto.from(summary, alertHorizonDays()))
                .toList();
    }

    private VesselSummaryDto applyThreshold(VesselSummaryDto summary, double threshold) {
        double slope = summary.trendSlopePctPerDay() == null
                ? Double.NaN : summary.trendSlopePctPerDay();
        boolean lowConfidence = Boolean.TRUE.equals(summary.forecastLowConfidence());
        DecisionSupport.Forecast forecast = DecisionSupport.forecastFromTrend(
                summary.latestSpeedLossPct(), threshold, slope, lowConfidence);
        DecisionSupport.Recommendation recommendation = DecisionSupport.recommend(
                summary.latestSpeedLossPct(), threshold, forecast.daysToThreshold(),
                alertHorizonDays(), summary.foulingAttributionPct(), summary.confidence());
        return new VesselSummaryDto(summary.vesselId(), summary.latestSpeedLossPct(),
                summary.foulingAttributionPct(), summary.confidence(), summary.sampleDays(),
                summary.daysSinceLastCleaning(), summary.dataQualityScore(),
                summary.reviewPriority(), threshold, forecast.daysToThreshold(),
                forecast.projectedCrossValuePct(), recommendation.status().name(),
                recommendation.action().name(), recommendation.rationale(),
                summary.cleaningsSinceDryDock(), summary.daysSinceDryDock(),
                summary.cleaningEffectiveness(), summary.fuelPenaltyPct(),
                summary.activeFuelType(), summary.estimatedAnnualExcessFuelMt(),
                summary.trendSlopePctPerDay(), forecast.lowConfidence());
    }

    private static int severity(String status) {
        return "ACT".equals(status) ? 0 : "WATCH".equals(status) ? 1 : 2;
    }
}
