package com.fleetmind.api;

public record VesselSummaryDto(
        String vesselId,
        double latestSpeedLossPct,
        double foulingAttributionPct,
        String confidence,
        int daysSinceLastCleaning,
        int dataQualityScore,
        int reviewPriority) {
}
