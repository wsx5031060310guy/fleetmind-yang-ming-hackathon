package com.fleetmind.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class FleetMindController {
    private final FleetDataProvider fleetData;
    private final FleetDecisionService fleetDecisionService;
    private final ThresholdService thresholdService;
    private final AlertNotificationService alertNotificationService;

    public FleetMindController(FleetDataProvider fleetData,
            FleetDecisionService fleetDecisionService,
            ThresholdService thresholdService,
            AlertNotificationService alertNotificationService) {
        this.fleetData = fleetData;
        this.fleetDecisionService = fleetDecisionService;
        this.thresholdService = thresholdService;
        this.alertNotificationService = alertNotificationService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "time", Instant.now().toString());
    }

    @GetMapping("/fleet/summary")
    public List<VesselSummaryDto> fleetSummary() {
        return fleetDecisionService.summaries();
    }

    @GetMapping("/config/threshold")
    public Map<String, Object> threshold() {
        return Map.of("thresholdPct", thresholdService.get());
    }

    @PutMapping("/config/threshold")
    public Map<String, Object> updateThreshold(@RequestParam("value") double value) {
        return Map.of("thresholdPct", thresholdService.set(value));
    }

    @GetMapping("/alerts")
    public List<DecisionDto> alerts() {
        return fleetDecisionService.alerts();
    }

    @PostMapping("/alerts/notify")
    public Map<String, Object> notifyAlerts() {
        List<DecisionDto> alerts = fleetDecisionService.alerts();
        alertNotificationService.publishAsync(thresholdService.get(), alerts);
        return Map.of("status", alertNotificationService.configured() ? "queued" : "disabled",
                "topicConfigured", alertNotificationService.configured(),
                "alertCount", alerts.size());
    }

    @GetMapping("/vessels/{vesselId}/decision")
    public DecisionDto decision(@PathVariable("vesselId") String vesselId) {
        return fleetDecisionService.decision(vesselId);
    }

    @GetMapping("/vessels/{vesselId}/performance")
    public List<DailyMetricDto> performance(@PathVariable("vesselId") String vesselId) {
        return fleetData.performance(vesselId);
    }

    @GetMapping("/vessels/{vesselId}/underwater-events")
    public List<UnderwaterEventDto> underwaterEvents(@PathVariable("vesselId") String vesselId) {
        return fleetData.underwaterEvents(vesselId);
    }

    @GetMapping("/vessels/{vesselId}/before-after")
    public BeforeAfterDto beforeAfter(
            @PathVariable("vesselId") String vesselId,
            @RequestParam(name = "eventId", required = false) String eventId) {
        return fleetData.beforeAfter(vesselId, eventId);
    }

    @PostMapping("/vessels/{vesselId}/ai-brief")
    public AiBriefDto aiBrief(
            @PathVariable("vesselId") String vesselId,
            @RequestParam(name = "forceFallback", defaultValue = "false") boolean forceFallback) {
        return fleetData.aiBrief(vesselId, forceFallback);
    }

    @GetMapping("/vessels/{vesselId}/ai-brief/prompt")
    public AiBriefPromptDto aiBriefPrompt(@PathVariable("vesselId") String vesselId) {
        return fleetData.aiBriefPrompt(vesselId);
    }

    @GetMapping("/data-quality/summary")
    public DataQualityDto dataQuality() {
        return fleetData.dataQuality();
    }

    @GetMapping("/fuel-consump/export")
    public ResponseEntity<String> fuelConsumpExport() {
        FuelConsumpExportDto export = fleetData.fuelExport();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=fuel-consump-demo.csv")
                .header("X-Transform-Version", export.transformVersion())
                .contentType(new MediaType("text", "csv"))
                .body(export.csv());
    }

    // An unknown vessel/event id is a missing resource, not a server fault:
    // return 404 instead of a 500 (e.g. before-after for a vessel not in the dataset).
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, Object> handleUnknownResource(IllegalArgumentException exception) {
        return Map.of("status", "not_found", "message", String.valueOf(exception.getMessage()));
    }

    @ExceptionHandler(ThresholdService.ThresholdValidationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleInvalidThreshold(
            ThresholdService.ThresholdValidationException exception) {
        return Map.of("status", "bad_request", "message", String.valueOf(exception.getMessage()));
    }
}
