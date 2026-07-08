package com.fleetmind.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class FleetMindController {
    private final DemoDataService demoData;

    public FleetMindController(DemoDataService demoData) {
        this.demoData = demoData;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "time", Instant.now().toString());
    }

    @GetMapping("/fleet/summary")
    public List<VesselSummaryDto> fleetSummary() {
        return demoData.fleetSummary();
    }

    @GetMapping("/vessels/{vesselId}/performance")
    public List<DailyMetricDto> performance(@PathVariable("vesselId") String vesselId) {
        return demoData.performance(vesselId);
    }

    @GetMapping("/vessels/{vesselId}/underwater-events")
    public List<UnderwaterEventDto> underwaterEvents(@PathVariable("vesselId") String vesselId) {
        return demoData.underwaterEvents(vesselId);
    }

    @GetMapping("/vessels/{vesselId}/before-after")
    public BeforeAfterDto beforeAfter(
            @PathVariable("vesselId") String vesselId,
            @RequestParam(name = "eventId", required = false) String eventId) {
        return demoData.beforeAfter(vesselId, eventId);
    }

    @PostMapping("/vessels/{vesselId}/ai-brief")
    public AiBriefDto aiBrief(@PathVariable("vesselId") String vesselId) {
        return demoData.aiBrief(vesselId);
    }

    @GetMapping("/data-quality/summary")
    public DataQualityDto dataQuality() {
        return demoData.dataQuality();
    }

    @GetMapping("/fuel-consump/export")
    public ResponseEntity<String> fuelConsumpExport() {
        FuelConsumpExportDto export = demoData.fuelExport();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=fuel-consump-demo.csv")
                .header("X-Transform-Version", export.transformVersion())
                .contentType(new MediaType("text", "csv"))
                .body(export.csv());
    }
}
