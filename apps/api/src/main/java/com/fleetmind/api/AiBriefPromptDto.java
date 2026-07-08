package com.fleetmind.api;

import java.util.List;

public record AiBriefPromptDto(
        String systemPrompt,
        String userPrompt,
        List<CitedMetricDto> citedMetrics,
        AiBriefGuardrailDto sampleValidation) {
}
