package com.fleetmind.api;

import java.util.List;

/**
 * Noon-report upload result. On dryRun the counts/rowErrors are a preview and
 * nothing is persisted. dryRun=false is currently also preview-only (mode =
 * "preview-only"): committing needs the core-calc recompute pipeline (P1), so the
 * message says so honestly rather than pretending data was ingested.
 */
public record UploadResultDto(
        String batchId,
        String mode,
        String message,
        String detectedEncoding,
        int totalRows,
        int accepted,
        int rejected,
        int overwrites,
        List<String> missingColumns,
        List<RowErrorDto> rowErrors) {
}
