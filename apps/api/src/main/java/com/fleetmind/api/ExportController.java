package com.fleetmind.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Machine-format integration endpoints so downstream (Yang Ming) systems can pull the
 * fleet decisions and current alerts as JSON or CSV. Pure re-shaping of existing
 * summaries/alerts — no new computation, low risk.
 */
@RestController
@RequestMapping("/api/export")
public class ExportController {
    private final FleetDecisionService fleetDecisionService;

    public ExportController(FleetDecisionService fleetDecisionService) {
        this.fleetDecisionService = fleetDecisionService;
    }

    @GetMapping("/decisions")
    public ResponseEntity<?> decisions(
            @RequestParam(name = "format", defaultValue = "json") String format,
            @RequestParam(name = "status", required = false) String status) {
        Set<String> statusFilter = parseStatusFilter(status);
        String computedAt = Instant.now().toString();
        List<ExportDecisionDto> rows = fleetDecisionService.summaries().stream()
                .filter(summary -> statusFilter == null || statusFilter.contains(summary.status()))
                .map(summary -> toExport(summary, computedAt))
                .toList();

        if (isCsv(format)) {
            StringBuilder csv = new StringBuilder(CsvUtil.row("vesselId", "status",
                    "recommendedAction", "latestSpeedLossPct", "thresholdPct",
                    "forecastDaysToThreshold", "activeFuelType", "reviewPriority", "computedAt"));
            for (ExportDecisionDto row : rows) {
                csv.append(CsvUtil.row(row.vesselId(), row.status(), row.recommendedAction(),
                        row.latestSpeedLossPct(), row.thresholdPct(), row.forecastDaysToThreshold(),
                        row.activeFuelType(), row.reviewPriority(), row.computedAt()));
            }
            return csvResponse("fleet-decisions.csv", csv.toString());
        }
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/alerts")
    public ResponseEntity<?> alerts(
            @RequestParam(name = "format", defaultValue = "json") String format,
            @RequestParam(name = "since", required = false) String since) {
        Instant sinceInstant = parseSince(since);
        Instant generatedAt = Instant.now();
        // The baked snapshot has no per-alert change timestamp: honour `since` by
        // returning the current alert set when since <= now, or an empty set when the
        // caller asks for changes strictly after "now". True incremental delivery needs
        // persistent change tracking (see futureRoadmap).
        List<DecisionDto> alerts = (sinceInstant != null && sinceInstant.isAfter(generatedAt))
                ? List.of() : fleetDecisionService.alerts();

        if (isCsv(format)) {
            StringBuilder csv = new StringBuilder(CsvUtil.row("vesselId", "status",
                    "currentSpeedLossPct", "thresholdPct", "forecastDaysToThreshold",
                    "recommendedAction", "confidence", "generatedAt"));
            for (DecisionDto alert : alerts) {
                csv.append(CsvUtil.row(alert.vesselId(), alert.status(), alert.currentSpeedLossPct(),
                        alert.thresholdPct(), alert.forecastDaysToThreshold(),
                        alert.recommendedAction(), alert.confidence(), generatedAt.toString()));
            }
            return csvResponse("fleet-alerts.csv", csv.toString());
        }
        return ResponseEntity.ok(Map.of("alerts", alerts, "generatedAt", generatedAt.toString()));
    }

    private static ExportDecisionDto toExport(VesselSummaryDto summary, String computedAt) {
        double threshold = summary.thresholdPct() == null ? 0.0 : summary.thresholdPct();
        return new ExportDecisionDto(summary.vesselId(), summary.status(),
                summary.recommendedAction(), summary.latestSpeedLossPct(), threshold,
                summary.forecastDaysToThreshold(), summary.activeFuelType(),
                summary.reviewPriority(), computedAt);
    }

    private static Set<String> parseStatusFilter(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        Set<String> filter = new LinkedHashSet<>();
        for (String part : status.split(",")) {
            String trimmed = part.trim().toUpperCase(java.util.Locale.ROOT);
            if (!trimmed.isEmpty()) {
                filter.add(trimmed);
            }
        }
        return filter.isEmpty() ? null : filter;
    }

    private static Instant parseSince(String since) {
        if (since == null || since.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(since);
        } catch (Exception primary) {
            try {
                return OffsetDateTime.parse(since).toInstant();
            } catch (Exception secondary) {
                throw new IllegalArgumentException("since must be an ISO-8601 instant: " + since);
            }
        }
    }

    private static boolean isCsv(String format) {
        return "csv".equalsIgnoreCase(format);
    }

    private static ResponseEntity<String> csvResponse(String filename, String csv) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(new MediaType("text", "csv"))
                .body(csv);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleBadRequest(IllegalArgumentException exception) {
        return Map.of("status", "bad_request", "message", String.valueOf(exception.getMessage()));
    }
}
