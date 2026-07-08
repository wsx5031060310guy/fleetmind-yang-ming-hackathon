package com.fleetmind.api;

import java.util.Map;

public record DataQualityDto(
        int totalRows,
        int exportedRows,
        Map<String, Integer> flagCounts) {
}
