package com.fleetmind.api;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class AiBriefGuardrail {
    private static final Pattern NUMBER = Pattern.compile("-?\\d+(?:,\\d{3})*(?:\\.\\d+)?");
    private static final Pattern NUMERIC_CLAIM = Pattern.compile(
            "(?<![A-Za-z0-9-])(?:\\$\\s*(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?)|(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?)(?:\\s*(%|days?|USD|MT|metric tons?|tons?|tCO2e?|tCO2|CO2|天)))",
            Pattern.CASE_INSENSITIVE);

    private AiBriefGuardrail() {
    }

    public static AiBriefGuardrailDto validate(String briefText, List<CitedMetricDto> citedMetrics) {
        List<String> violations = new ArrayList<>();
        Set<String> allowedNumbers = new LinkedHashSet<>();
        Set<String> allowedMetricIds = new LinkedHashSet<>();

        for (CitedMetricDto metric : citedMetrics == null ? List.<CitedMetricDto>of() : citedMetrics) {
            allowedMetricIds.add(metric.metricId());
            Matcher matcher = NUMBER.matcher(metric.value());
            while (matcher.find()) {
                allowedNumbers.add(normalizeNumber(matcher.group()));
            }
        }

        if (allowedMetricIds.isEmpty()) {
            violations.add("missing cited metrics");
        }

        String text = briefText == null ? "" : briefText;
        boolean sawNumericClaim = false;
        Matcher claimMatcher = NUMERIC_CLAIM.matcher(text);
        while (claimMatcher.find()) {
            sawNumericClaim = true;
            String matchedNumber = claimMatcher.group(1) == null ? claimMatcher.group(2) : claimMatcher.group(1);
            String normalizedClaim = normalizeNumber(matchedNumber);
            if (!allowedNumbers.contains(normalizedClaim)) {
                violations.add("uncited numeric claim: " + claimMatcher.group());
            }
        }

        if (sawNumericClaim && allowedMetricIds.stream().noneMatch(metricId -> text.contains("[" + metricId + "]"))) {
            violations.add("missing inline metric citation");
        }

        return new AiBriefGuardrailDto(violations.isEmpty(), List.copyOf(violations), List.copyOf(allowedMetricIds));
    }

    private static String normalizeNumber(String value) {
        String numeric = value.replace("$", "").replace(",", "").trim();
        return new BigDecimal(numeric).stripTrailingZeros().toPlainString();
    }
}
