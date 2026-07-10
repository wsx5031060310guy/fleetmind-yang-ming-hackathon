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
            "(?<![A-Za-z0-9_-])(?:(?:USD|\\$)\\s*)?(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?)(?:\\s*(?:%|days?|天|USD|\\$|MT|metric tons?|tons?|tCO2e?|tCO2|CO2|knots?|kn|節|hours?|小時))?(?![A-Za-z0-9_-])",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INLINE_CITATION = Pattern.compile("\\[([A-Za-z0-9_-]+)]");
    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private AiBriefGuardrail() {
    }

    public static AiBriefGuardrailDto validate(String briefText, List<CitedMetricDto> citedMetrics) {
        List<String> violations = new ArrayList<>();
        Set<String> allowedMetricIds = new LinkedHashSet<>();
        java.util.Map<String, Set<String>> numbersByMetric = new java.util.LinkedHashMap<>();

        for (CitedMetricDto metric : citedMetrics == null ? List.<CitedMetricDto>of() : citedMetrics) {
            allowedMetricIds.add(metric.metricId());
            Set<String> metricNumbers = new LinkedHashSet<>();
            Matcher matcher = NUMBER.matcher(metric.value());
            while (matcher.find()) {
                metricNumbers.add(normalizeNumber(matcher.group()));
            }
            numbersByMetric.put(metric.metricId(), metricNumbers);
        }

        if (allowedMetricIds.isEmpty()) {
            violations.add("missing cited metrics");
        }

        String text = briefText == null ? "" : briefText;
        Matcher claimMatcher = NUMERIC_CLAIM.matcher(text);
        while (claimMatcher.find()) {
            if (insideMatch(text, claimMatcher.start(), INLINE_CITATION)
                    || insideMatch(text, claimMatcher.start(), ISO_DATE)) {
                continue;
            }
            String normalizedClaim = normalizeNumber(claimMatcher.group(1));
            String metricId = nearestCitation(text, claimMatcher.start(), claimMatcher.end());
            if (metricId == null) {
                violations.add("uncited numeric claim: " + claimMatcher.group());
            } else if (!numbersByMetric.getOrDefault(metricId, Set.of()).contains(normalizedClaim)) {
                violations.add("claim cites wrong metric: " + claimMatcher.group() + " [" + metricId + "]");
            }
        }

        return new AiBriefGuardrailDto(violations.isEmpty(), List.copyOf(violations), List.copyOf(allowedMetricIds));
    }

    private static boolean insideMatch(String text, int position, Pattern pattern) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            if (matcher.start() <= position && position < matcher.end()) {
                return true;
            }
            if (matcher.start() > position) {
                return false;
            }
        }
        return false;
    }

    private static String nearestCitation(String text, int claimStart, int claimEnd) {
        int sentenceStart = sentenceStart(text, claimStart);
        int sentenceEnd = sentenceEnd(text, claimEnd);
        Matcher matcher = INLINE_CITATION.matcher(text);
        String nearestBefore = null;
        int nearestBeforeDistance = Integer.MAX_VALUE;
        String nearestAfter = null;
        int nearestAfterDistance = Integer.MAX_VALUE;
        while (matcher.find()) {
            if (matcher.start() < sentenceStart || matcher.end() > sentenceEnd) {
                continue;
            }
            if (matcher.start() >= claimEnd) {
                int distance = matcher.start() - claimEnd;
                if (distance <= 120 && distance < nearestAfterDistance) {
                    nearestAfter = matcher.group(1);
                    nearestAfterDistance = distance;
                }
            } else if (matcher.end() <= claimStart) {
                int distance = claimStart - matcher.end();
                if (distance <= 120 && distance < nearestBeforeDistance) {
                    nearestBefore = matcher.group(1);
                    nearestBeforeDistance = distance;
                }
            }
        }
        // Inline citations conventionally follow claims. Prefer the closest following citation so
        // a preceding claim's citation cannot steal a later claim whose own citation follows it.
        return nearestAfter != null ? nearestAfter : nearestBefore;
    }

    private static int sentenceStart(String text, int position) {
        for (int index = position - 1; index >= 0; index--) {
            if (text.charAt(index) == '。' || isSentencePeriod(text, index)) {
                return index + 1;
            }
        }
        return 0;
    }

    private static int sentenceEnd(String text, int position) {
        for (int index = position; index < text.length(); index++) {
            if (text.charAt(index) == '。' || isSentencePeriod(text, index)) {
                return index;
            }
        }
        return text.length();
    }

    private static boolean isSentencePeriod(String text, int index) {
        if (text.charAt(index) != '.') {
            return false;
        }
        return index == 0 || index + 1 == text.length()
                || !Character.isDigit(text.charAt(index - 1))
                || !Character.isDigit(text.charAt(index + 1));
    }

    private static String normalizeNumber(String value) {
        String numeric = value.replace("$", "").replace(",", "").trim();
        return new BigDecimal(numeric).stripTrailingZeros().toPlainString();
    }
}
