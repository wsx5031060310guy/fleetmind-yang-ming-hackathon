package com.fleetmind.api;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiBriefGuardrailTest {
    private static final List<CitedMetricDto> CITATIONS = List.of(
            new CitedMetricDto("latest_speed_loss_pct", "4.76", "/api/fleet/summary"),
            new CitedMetricDto("payback_days", "16.87", "/api/vessels/YM-DEMO-01/before-after"));

    @Test
    void acceptsNumbersThatMatchCitedMetrics() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed 4.76% speed loss [latest_speed_loss_pct] and about 16.87 days payback [payback_days].",
                CITATIONS);

        assertTrue(result.passed());
        assertTrue(result.violations().isEmpty());
    }

    @Test
    void rejectsUncitedNumericClaimsWithUnits() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed 4.76% speed loss [latest_speed_loss_pct] and 999 USD avoidable cost.",
                CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().getFirst().contains("999 USD"));
    }

    @Test
    void rejectsUncitedDollarClaimsWithoutUnit() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed 4.76% speed loss [latest_speed_loss_pct] and $999 avoidable cost.",
                CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().getFirst().contains("$999"));
    }

    @Test
    void rejectsNumericClaimsWithoutInlineMetricCitation() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed 4.76% speed loss and about 16.87 days payback.",
                CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().contains("missing inline metric citation"));
    }

    @Test
    void promptForcesSuppliedJsonAndCitedNumbers() {
        assertTrue(AiBriefPrompt.systemPrompt().contains("Use only the supplied JSON"));
        assertTrue(AiBriefPrompt.systemPrompt().contains("Every numeric claim"));
    }
}
