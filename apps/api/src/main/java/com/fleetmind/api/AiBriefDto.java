package com.fleetmind.api;

import java.time.Instant;
import java.util.List;

public record AiBriefDto(
        String vesselId,
        Instant generatedAt,
        String mode,
        String briefText,
        List<CitedMetricDto> citedMetrics) {
}
