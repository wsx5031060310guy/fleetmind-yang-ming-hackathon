package com.fleetmind.api;

public record DecisionDto(
        String vesselId,
        double thresholdPct,
        double currentSpeedLossPct,
        Integer forecastDaysToThreshold,
        Double projectedCrossValuePct,
        String status,
        String recommendedAction,
        String rationale,
        int alertHorizonDays,
        Integer cleaningsSinceDryDock,
        Integer daysSinceDryDock,
        String cleaningEffectiveness,
        Double fuelPenaltyPct,
        String activeFuelType,
        Double estimatedAnnualExcessFuelMt,
        String confidence) {

    static DecisionDto from(VesselSummaryDto summary, int alertHorizonDays) {
        return new DecisionDto(summary.vesselId(), summary.thresholdPct(),
                summary.latestSpeedLossPct(), summary.forecastDaysToThreshold(),
                summary.projectedCrossValuePct(), summary.status(),
                summary.recommendedAction(), summary.rationale(), alertHorizonDays,
                summary.cleaningsSinceDryDock(), summary.daysSinceDryDock(),
                summary.cleaningEffectiveness(), summary.fuelPenaltyPct(),
                summary.activeFuelType(), summary.estimatedAnnualExcessFuelMt(),
                summary.confidence());
    }
}
