package com.fleetmind.api;

public record CitedMetricDto(
        String metricId,
        String value,
        String href) {
}
