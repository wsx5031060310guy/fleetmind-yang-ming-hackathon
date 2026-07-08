package com.fleetmind.api;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

public final class AiBriefPrompt {
    private static final String SYSTEM_PROMPT = """
            You are FleetMind's vessel-performance analyst for a shipping hackathon demo.
            Follow these rules:
            1. Use only the supplied JSON. Do not add outside facts, model guesses, or hidden assumptions.
            2. Every numeric claim must exactly match a value in citedMetrics.
            3. Cite metric ids inline as [metric_id] after each numeric claim.
            4. If the supplied JSON is insufficient, say what is missing instead of inventing.
            5. Recommend human review. Do not claim guaranteed savings, guaranteed causality, or a maintenance order.
            """;

    private AiBriefPrompt() {
    }

    public static String systemPrompt() {
        return SYSTEM_PROMPT;
    }

    public static String buildUserPrompt(
            String vesselId,
            BeforeAfterDto beforeAfter,
            List<UnderwaterEventDto> events,
            List<CitedMetricDto> citedMetrics) {
        return String.format(Locale.US, """
                Generate a concise maintenance brief for this JSON only.
                {
                  "vesselId": "%s",
                  "beforeAfter": {
                    "eventId": "%s",
                    "medianKBefore": %.5f,
                    "medianKAfter": %.5f,
                    "recoveryPct": %.2f,
                    "paybackDays": %.2f
                  },
                  "underwaterEvents": [%s],
                  "citedMetrics": [%s]
                }
                """,
                json(vesselId),
                json(beforeAfter.eventId()),
                beforeAfter.medianKBefore(),
                beforeAfter.medianKAfter(),
                beforeAfter.recoveryPct(),
                beforeAfter.businessImpact().paybackDays(),
                events.stream().map(AiBriefPrompt::eventJson).collect(Collectors.joining(", ")),
                citedMetrics.stream().map(AiBriefPrompt::metricJson).collect(Collectors.joining(", ")));
    }

    private static String eventJson(UnderwaterEventDto event) {
        return String.format(Locale.US,
                "{\"eventId\":\"%s\",\"date\":\"%s\",\"type\":\"%s\"}",
                json(event.eventId()),
                event.date(),
                json(event.type()));
    }

    private static String metricJson(CitedMetricDto metric) {
        return String.format(Locale.US,
                "{\"metricId\":\"%s\",\"value\":\"%s\",\"href\":\"%s\"}",
                json(metric.metricId()),
                json(metric.value()),
                json(metric.href()));
    }

    private static String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
