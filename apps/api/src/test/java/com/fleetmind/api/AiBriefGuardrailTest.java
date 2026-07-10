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
        assertTrue(result.violations().stream().allMatch(value -> value.startsWith("uncited numeric claim")));
    }

    @Test
    void rejectsBareNumberWithoutUnit() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "The unexplained score is 999.", CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().getFirst().contains("999"));
    }

    @Test
    void rejectsUnitBeforeNumber() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Avoidable cost is USD 470,000.", CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().getFirst().contains("USD 470,000"));
    }

    @Test
    void rejectsOneCitationUsedForMultipleClaims() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed 4.76% speed loss and 16.87 days payback [payback_days].", CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().stream().anyMatch(value -> value.contains("wrong metric")));
    }

    @Test
    void rejectsWrongMetricCitation() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed 4.76% speed loss [payback_days].", CITATIONS);

        assertFalse(result.passed());
        assertTrue(result.violations().getFirst().contains("claim cites wrong metric"));
    }

    @Test
    void acceptsKnotsWithCorrectCitation() {
        List<CitedMetricDto> citations = List.of(
                new CitedMetricDto("observed_speed_knots", "18.5", "/api/vessels/YM-DEMO-01/performance"));

        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "Observed speed was 18.5 knots [observed_speed_knots].", citations);

        assertTrue(result.passed());
    }

    @Test
    void acceptsTextWithoutNumericClaimsWhenCitationsExist() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate("Recommend human inspection.", CITATIONS);

        assertTrue(result.passed());
    }

    @Test
    void ignoresIsoDates() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate("Inspection occurred on 2025-03-15.", CITATIONS);

        assertTrue(result.passed());
    }

    @Test
    void deterministicBriefStillPasses() {
        AiBriefGuardrailDto result = AiBriefGuardrail.validate(
                "YM-DEMO-01 shows speed loss under comparable conditions. "
                        + "The deterministic calculation estimates 4.76% speed loss [latest_speed_loss_pct] "
                        + "and about 16.87 days payback [payback_days] under the stated assumptions.",
                CITATIONS);

        assertTrue(result.passed());
    }

    @Test
    void promptEnforcesFixedSectionsAndCitationBoundary() {
        assertTrue(AiBriefPrompt.systemPrompt().contains("異常摘要 / 水下事件關聯分析 / 建議行動 / 限制與缺失資料"));
        assertTrue(AiBriefPrompt.systemPrompt().contains("每個數字"));
        assertTrue(AiBriefPrompt.systemPrompt().contains("數字來自計算，語言來自 AI，決策留給人"));
    }
}
