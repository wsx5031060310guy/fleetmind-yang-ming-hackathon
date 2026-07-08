package com.fleetmind.api;

import java.util.List;

public record AiBriefGuardrailDto(
        boolean passed,
        List<String> violations,
        List<String> allowedMetricIds) {
}
