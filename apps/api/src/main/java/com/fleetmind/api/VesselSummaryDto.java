package com.fleetmind.api;

public record VesselSummaryDto(
        String vesselId,
        double latestSpeedLossPct,
        double foulingAttributionPct,
        String confidence,
        int sampleDays,
        int daysSinceLastCleaning,
        int dataQualityScore,
        int reviewPriority,
        Double thresholdPct,
        Integer forecastDaysToThreshold,
        Double projectedCrossValuePct,
        String status,
        String recommendedAction,
        String rationale,
        Integer cleaningsSinceDryDock,
        Integer daysSinceDryDock,
        String cleaningEffectiveness,
        Double fuelPenaltyPct,
        String activeFuelType,
        Double estimatedAnnualExcessFuelMt,
        Double trendSlopePctPerDay,
        Boolean forecastLowConfidence) {

    public VesselSummaryDto(String vesselId, double latestSpeedLossPct,
            double foulingAttributionPct, String confidence, int sampleDays,
            int daysSinceLastCleaning, int dataQualityScore, int reviewPriority) {
        this(vesselId, latestSpeedLossPct, foulingAttributionPct, confidence, sampleDays,
                daysSinceLastCleaning, dataQualityScore, reviewPriority,
                null, null, null, null, null, null, 0, null, "FRESH",
                0.0, "UNKNOWN", null, null, true);
    }
}
