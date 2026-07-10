package com.fleetmind.api;

public record BeforeAfterDto(
        String eventId,
        String vesselId,
        double medianKBefore,
        double medianKAfter,
        double recoveryPct,
        BusinessImpactDto businessImpact) {
}
