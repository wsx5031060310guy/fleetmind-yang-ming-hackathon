package com.fleetmind.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Human upload path for noon-report CSVs (fallback when there is no system
 * integration). Parses + validates and returns a dry-run preview. dryRun=false is
 * currently preview-only: an honest message says committing needs the core-calc
 * recompute pipeline (P1) rather than pretending data was ingested. Demonstrates the
 * ingest validation capability without touching the baked dataset.
 */
@RestController
@RequestMapping("/api/uploads")
public class NoonReportUploadController {
    private static final long MAX_BYTES = 10L * 1024 * 1024;

    private final FleetDataProvider fleetData;
    private final AdminSettingsService settings;

    public NoonReportUploadController(FleetDataProvider fleetData, AdminSettingsService settings) {
        this.fleetData = fleetData;
        this.settings = settings;
    }

    @PostMapping(value = "/noon-report", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadResultDto upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "dryRun", defaultValue = "true") boolean dryRun) throws IOException {
        String batchId = "batch-" + UUID.randomUUID();
        if (file == null || file.isEmpty()) {
            return fileError(batchId, "EMPTY_FILE", "檔案為空或未提供", null);
        }
        if (file.getSize() > MAX_BYTES) {
            return fileError(batchId, "FILE_TOO_LARGE", "檔案超過 10MB 上限", null);
        }

        Set<String> whitelist = fleetData.fleetSummary().stream()
                .map(VesselSummaryDto::vesselId)
                .collect(Collectors.toUnmodifiableSet());
        NoonReportCsvParser.Result parsed = NoonReportCsvParser.parse(file.getBytes(), whitelist,
                settings.fuelTypeMapping(), settings.fuelTypeDefault());

        if (parsed.fileError != null) {
            return fileError(batchId, parsed.fileError, fileErrorMessage(parsed.fileError),
                    parsed.missingColumns);
        }

        String mode = dryRun ? "preview" : "preview-only";
        String message = dryRun
                ? "dry-run 預覽，未落庫"
                : "preview-only：commit 需重算管線（P1 待接 core-calc runtime 重算），本次未落庫";
        return new UploadResultDto(batchId, mode, message, parsed.detectedEncoding,
                parsed.totalRows, parsed.accepted, parsed.rejected, parsed.overwrites,
                List.of(), parsed.rowErrors);
    }

    private static UploadResultDto fileError(String batchId, String code, String message,
            List<String> missingColumns) {
        String detail = missingColumns == null || missingColumns.isEmpty()
                ? message
                : message + "：" + String.join(", ", missingColumns);
        return new UploadResultDto(batchId, "rejected", detail, null,
                0, 0, 0, 0, missingColumns == null ? List.of() : missingColumns, List.of());
    }

    private static String fileErrorMessage(String code) {
        return switch (code) {
            case "EMPTY_FILE" -> "檔案為空或僅有空白列";
            case "FILE_TOO_LARGE" -> "檔案超過 10MB 上限";
            case "HEADER_ONLY" -> "只有表頭、沒有資料列";
            case "MISSING_REQUIRED_COLUMNS" -> "缺少必填欄位";
            default -> code;
        };
    }

    // Missing multipart part / bad request -> 400 rather than 500.
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleBadRequest(IllegalArgumentException exception) {
        return Map.of("status", "bad_request", "message", String.valueOf(exception.getMessage()));
    }
}
