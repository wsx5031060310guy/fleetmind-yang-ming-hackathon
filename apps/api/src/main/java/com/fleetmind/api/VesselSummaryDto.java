package com.fleetmind.api;

public record VesselSummaryDto(
        String vesselId,
        double latestSpeedLossPct,
        double foulingAttributionPct,
        String confidence,
        int sampleDays,
        int daysSinceLastCleaning,
        int dataQualityScore,
        int reviewPriority) {
}
