package com.fleetmind.api;

import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class RealDataService implements FleetDataProvider {
    private static final String TRANSFORM_VERSION = "yang-ming-real-v1";

    private final List<VesselSummaryDto> fleet;
    private final Map<String, VesselData> vessels;
    private final DataQualityDto dataQuality;
    private final AiBriefService aiBriefService;
    private final DemoDataService demoFallback;

    public RealDataService(Path metricsFile, ObjectMapper objectMapper,
            AiBriefService aiBriefService, DemoDataService demoFallback) throws IOException {
        this.aiBriefService = aiBriefService;
        this.demoFallback = demoFallback;
        MetricsFile parsed;
        try (InputStream input = Files.newInputStream(metricsFile)) {
            parsed = objectMapper.readValue(input, MetricsFile.class);
        }
        if (parsed == null || parsed.fleet == null || parsed.fleet.isEmpty()) {
            throw new IllegalArgumentException("metrics file has no fleet rows: " + metricsFile);
        }
        this.fleet = List.copyOf(parsed.fleet);
        Map<String, VesselData> converted = new LinkedHashMap<>();
        if (parsed.vessels != null) {
            parsed.vessels.forEach((id, vessel) -> converted.put(id, convert(vessel)));
        }
        this.vessels = Map.copyOf(converted);
        this.dataQuality = parsed.dataQuality == null
                ? new DataQualityDto(0, 0, Map.of()) : parsed.dataQuality;
        boolean hasFinite = fleet.stream().anyMatch(summary ->
                Double.isFinite(summary.latestSpeedLossPct()));
        if (!hasFinite) {
            throw new IllegalArgumentException("metrics file has no finite latestSpeedLossPct: "
                    + metricsFile);
        }
    }

    @Override
    public List<VesselSummaryDto> fleetSummary() {
        return fleet;
    }

    @Override
    public List<DailyMetricDto> performance(String vesselId) {
        VesselData vessel = vessels.get(vesselId);
        return vessel == null ? List.of() : vessel.performance;
    }

    @Override
    public List<UnderwaterEventDto> underwaterEvents(String vesselId) {
        VesselData vessel = vessels.get(vesselId);
        return vessel == null ? List.of() : vessel.events;
    }

    @Override
    public BeforeAfterDto beforeAfter(String vesselId, String eventId) {
        VesselData vessel = requireVessel(vesselId);
        if (eventId != null && vessel.beforeAfter.containsKey(eventId)) {
            return vessel.beforeAfter.get(eventId);
        }
        return vessel.beforeAfter.values().stream()
                .filter(comparison -> comparison.businessImpact().paybackDays() != null
                        && Double.isFinite(comparison.businessImpact().paybackDays()))
                .findFirst()
                .or(() -> vessel.beforeAfter.values().stream().findFirst())
                .orElseThrow(() -> new IllegalArgumentException(
                        "no before-after metrics for vessel " + vesselId));
    }

    @Override
    public DataQualityDto dataQuality() {
        return dataQuality;
    }

    @Override
    public FuelConsumpExportDto fuelExport() {
        // Prediction submission owns the official 25% task. Keep legacy export endpoint stable.
        FuelConsumpExportDto demo = demoFallback.fuelExport();
        return new FuelConsumpExportDto(TRANSFORM_VERSION, demo.csv());
    }

    @Override
    public AiBriefDto aiBrief(String vesselId, boolean forceFallback) {
        List<CitedMetricDto> citations = aiBriefCitations(vesselId);
        BeforeAfterDto comparison = beforeAfter(vesselId, null);
        String text = deterministicBrief(vesselId, citations);
        if (forceFallback) {
            return new AiBriefDto(vesselId, Instant.now(), "deterministic-forced-fallback",
                    text, citations, AiBriefGuardrail.validate(text, citations));
        }
        AiBriefService.Result result = aiBriefService.generateBrief(vesselId, comparison,
                underwaterEvents(vesselId), citations, isLowConfidence(vesselId));
        return new AiBriefDto(vesselId, Instant.now(), result.mode(), result.text(),
                result.citations(), result.guardrail());
    }

    @Override
    public AiBriefPromptDto aiBriefPrompt(String vesselId) {
        List<CitedMetricDto> citations = aiBriefCitations(vesselId);
        BeforeAfterDto comparison = beforeAfter(vesselId, null);
        String text = deterministicBrief(vesselId, citations);
        return new AiBriefPromptDto(AiBriefPrompt.systemPrompt(),
                AiBriefPrompt.buildUserPrompt(vesselId, comparison, underwaterEvents(vesselId),
                        citations, isLowConfidence(vesselId)),
                citations, AiBriefGuardrail.validate(text, citations));
    }

    private VesselData convert(VesselFile source) {
        if (source == null) {
            return new VesselData(List.of(), List.of(), Map.of());
        }
        List<DailyMetricDto> performance = source.performance == null ? List.of()
                : source.performance.stream().map(metric -> new DailyMetricDto(
                        metric.vesselId,
                        LocalDate.parse(metric.date),
                        numberOrNaN(metric.dailyFoc),
                        numberOrNaN(metric.kValue),
                        numberOrNaN(metric.speedLossPct),
                        metric.qualityFlags == null ? List.of() : List.copyOf(metric.qualityFlags)))
                        .toList();
        List<UnderwaterEventDto> events = source.events == null ? List.of()
                : source.events.stream().map(event -> new UnderwaterEventDto(
                        event.eventId,
                        event.vesselId,
                        LocalDate.parse(event.date),
                        event.type == null ? event.eventType : event.type)).toList();
        Map<String, BeforeAfterDto> comparisons = new LinkedHashMap<>();
        if (source.beforeAfter != null) {
            source.beforeAfter.forEach((eventId, comparison) -> comparisons.put(eventId,
                    new BeforeAfterDto(comparison.eventId, comparison.vesselId,
                            numberOrNaN(comparison.medianKBefore),
                            numberOrNaN(comparison.medianKAfter),
                            numberOrNaN(comparison.recoveryPct),
                            comparison.businessImpact == null ? emptyBusinessImpact()
                                    : comparison.businessImpact)));
        }
        return new VesselData(List.copyOf(performance), List.copyOf(events),
                Collections.unmodifiableMap(new LinkedHashMap<>(comparisons)));
    }

    private VesselData requireVessel(String vesselId) {
        VesselData vessel = vessels.get(vesselId);
        if (vessel == null) {
            throw new IllegalArgumentException("unknown vessel: " + vesselId);
        }
        return vessel;
    }

    private boolean isLowConfidence(String vesselId) {
        return fleet.stream().filter(summary -> summary.vesselId().equals(vesselId))
                .findFirst().map(summary -> "LOW".equals(summary.confidence())).orElse(true);
    }

    private List<CitedMetricDto> aiBriefCitations(String vesselId) {
        VesselSummaryDto summary = fleet.stream()
                .filter(candidate -> candidate.vesselId().equals(vesselId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unknown vessel: " + vesselId));
        BeforeAfterDto data = beforeAfter(vesselId, null);
        String href = "/api/vessels/" + vesselId + "/before-after?eventId=" + data.eventId();
        return List.of(
                new CitedMetricDto("latest_speed_loss_pct",
                        format(summary.latestSpeedLossPct(), 2), "/api/fleet/summary"),
                new CitedMetricDto("median_k_before", format(data.medianKBefore(), 5), href),
                new CitedMetricDto("median_k_after", format(data.medianKAfter(), 5), href),
                new CitedMetricDto("recovery_pct", format(data.recoveryPct(), 2), href),
                new CitedMetricDto("payback_days",
                        format(data.businessImpact().paybackDays(), 2), href));
    }

    private String deterministicBrief(String vesselId, List<CitedMetricDto> citations) {
        Map<String, String> values = new LinkedHashMap<>();
        citations.forEach(metric -> values.put(metric.metricId(), metric.value()));
        return vesselId + " shows speed loss under comparable conditions. "
                + "The deterministic calculation estimates "
                + values.get("latest_speed_loss_pct")
                + "% speed loss [latest_speed_loss_pct] and about "
                + values.get("payback_days") + " days payback [payback_days] "
                + "under the stated fuel, carbon, and cleaning-cost assumptions. "
                + "Recommend human review for inspection, then cleaning or propeller "
                + "polishing if onboard evidence matches.";
    }

    private static String format(Double value, int decimals) {
        return value == null || !Double.isFinite(value) ? "N/A"
                : String.format(Locale.US, "%." + decimals + "f", value);
    }

    private static double numberOrNaN(Double value) {
        return value == null ? Double.NaN : value;
    }

    private static BusinessImpactDto emptyBusinessImpact() {
        return new BusinessImpactDto(null, null, null, null, null, null, null, null, null);
    }

    private record MetricsFile(List<VesselSummaryDto> fleet,
            Map<String, VesselFile> vessels, DataQualityDto dataQuality) {
    }

    private record VesselFile(List<FileDailyMetric> performance, List<FileEvent> events,
            Map<String, FileBeforeAfter> beforeAfter, AttributionFile attribution,
            CounterfactualFile counterfactual) {
    }

    private record FileDailyMetric(String vesselId, String date, Double dailyFoc,
            Double kValue, Double speedLossPct, List<String> qualityFlags) {
    }

    private record FileEvent(String eventId, String vesselId, String date, String type,
            String eventType, String verdict, Boolean expectedImprovement,
            Double measuredDeltaPct, Double noiseThresholdPct, Boolean lowConfidence) {
    }

    private record FileBeforeAfter(String eventId, String vesselId, Double medianKBefore,
            Double medianKAfter, Double recoveryPct, BusinessImpactDto businessImpact) {
    }

    private record AttributionFile(Double hullPct, Double propPct, Boolean heuristic,
            Boolean lowConfidence) {
    }

    private record CounterfactualFile(Double uwcSavingsMtDay, Double ppSavingsMtDay,
            Double pct, Double annualSavingsUsd, Double fuelPriceUsdPerMt) {
    }

    private record VesselData(List<DailyMetricDto> performance,
            List<UnderwaterEventDto> events, Map<String, BeforeAfterDto> beforeAfter) {
    }
}
