package com.fleetmind.api;

import com.fleetmind.corecalc.BusinessImpactResult;

public record BeforeAfterDto(
        String eventId,
        String vesselId,
        double medianKBefore,
        double medianKAfter,
        double recoveryPct,
        BusinessImpactResult businessImpact) {
}
