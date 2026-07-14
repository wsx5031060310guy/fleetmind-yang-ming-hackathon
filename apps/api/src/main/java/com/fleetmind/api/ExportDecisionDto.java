package com.fleetmind.api;

/**
 * Machine-format per-vessel decision row for GET /api/export/decisions. Field names
 * mirror the existing real-metrics.json / summary keys — no new naming invented.
 * {@code computedAt} is the export snapshot time (the baked dataset has no per-vessel
 * timestamp).
 */
public record ExportDecisionDto(
        String vesselId,
        String status,
        String recommendedAction,
        double latestSpeedLossPct,
        double thresholdPct,
        Integer forecastDaysToThreshold,
        String activeFuelType,
        int reviewPriority,
        String computedAt) {
}
