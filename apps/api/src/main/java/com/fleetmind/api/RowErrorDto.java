package com.fleetmind.api;

import java.util.List;

/**
 * Per-row validation outcome for the noon-report upload preview. Used both for
 * rejected rows (reason = a rejection code) and accepted-with-flags rows
 * (reason = ACCEPTED_WITH_FLAGS). rowIndex is the 1-based file line number.
 */
public record RowErrorDto(
        int rowIndex,
        String vesselId,
        String date,
        String reason,
        List<String> qualityFlags) {
}
