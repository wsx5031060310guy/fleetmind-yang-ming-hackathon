package com.fleetmind.api;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class DemoDataService implements FleetDataProvider {
    private static final String TRANSFORM_VERSION = "demo-static-v1";
    private final AiBriefService aiBriefService;

    public DemoDataService(AiBriefService aiBriefService) {
        this.aiBriefService = aiBriefService;
    }

    public List<VesselSummaryDto> fleetSummary() {
        return List.of(
                summary("YM-DEMO-01", 4.76, 68.0, "HIGH", 37, 37, 92, 1,
                        0.08, 15.7, 1, 420, "FRESH", "VLSFO"),
                summary("YM-DEMO-02", 2.10, 41.0, "MEDIUM", 24, 84, 88, 2,
                        0.02, 6.7, 2, 700, "DIMINISHING", "HFO"),
                summary("YM-DEMO-03", 0.00, 0.0, "LOW", 12, 12, 75, 3,
                        -0.01, 0.0, 4, null, "DEPLETED", "BLSF"));
    }

    public List<DailyMetricDto> performance(String vesselId) {
        if ("YM-DEMO-02".equals(vesselId)) {
            return List.of(
                    metric(vesselId, "2025-01-01", 54.1, 0.00691, 0.30),
                    metric(vesselId, "2025-02-01", 55.0, 0.00702, 1.10),
                    metric(vesselId, "2025-03-01", 55.7, 0.00710, 1.80, "MISSING_WIND_SCALE"),
                    metric(vesselId, "2025-04-01", 53.9, 0.00688, 0.15),
                    metric(vesselId, "2025-05-01", 55.9, 0.00713, 2.10));
        }
        if ("YM-DEMO-03".equals(vesselId)) {
            return List.of(
                    metric(vesselId, "2025-01-01", 47.0, 0.00640, 0.00, "INSUFFICIENT_FULL_SPEED_HOURS"),
                    metric(vesselId, "2025-02-01", 47.4, 0.00645, 0.45),
                    metric(vesselId, "2025-03-01", 48.1, 0.00655, 1.20, "HIGH_WIND"),
                    metric(vesselId, "2025-04-01", 46.9, 0.00639, -0.10),
                    metric(vesselId, "2025-05-01", 47.0, 0.00640, 0.00));
        }
        return List.of(
                metric(vesselId, "2025-01-01", 58.0, 0.00725, 0.00),
                metric(vesselId, "2025-02-01", 59.4, 0.00743, 1.92),
                metric(vesselId, "2025-03-01", 61.0, 0.00763, 4.76, "HIGH_WIND"),
                metric(vesselId, "2025-04-01", 57.8, 0.00722, -0.20),
                metric(vesselId, "2025-05-01", 58.8, 0.00735, 1.45),
                metric(vesselId, "2025-06-01", 61.0, 0.00763, 4.76));
    }

    public List<UnderwaterEventDto> underwaterEvents(String vesselId) {
        String suffix = vesselId.substring(vesselId.lastIndexOf('-') + 1);
        return List.of(
                new UnderwaterEventDto("event-2025-03-cleaning-" + suffix, vesselId, LocalDate.parse("2025-03-15"), "cleaning"),
                new UnderwaterEventDto("event-2025-04-polishing-" + suffix, vesselId, LocalDate.parse("2025-04-10"), "propeller_polishing"));
    }

    public BeforeAfterDto beforeAfter(String vesselId, String eventId) {
        double medianKBefore = 0.00763;
        double medianKAfter = 0.00722;
        double focBefore = 61.0;
        double focAfter = 57.8;
        if ("YM-DEMO-02".equals(vesselId)) {
            medianKBefore = 0.00710;
            medianKAfter = 0.00688;
            focBefore = 55.7;
            focAfter = 53.9;
        } else if ("YM-DEMO-03".equals(vesselId)) {
            medianKBefore = 0.00655;
            medianKAfter = 0.00639;
            focBefore = 48.1;
            focAfter = 46.9;
        }
        double recoveryPct = (medianKBefore - medianKAfter) / medianKBefore * 100.0;
        return new BeforeAfterDto(
                eventId == null ? underwaterEvents(vesselId).getFirst().eventId() : eventId,
                vesselId,
                medianKBefore,
                medianKAfter,
                recoveryPct,
                new BusinessImpactDto(Math.max(0.0, focBefore - focAfter),
                        null, null, null, null, null, null, null, null));
    }

    public DataQualityDto dataQuality() {
        return new DataQualityDto(3, 3, Map.of(
                "HIGH_WIND", 1,
                "INSUFFICIENT_FULL_SPEED_HOURS", 1,
                "INVALID_FULL_SPEED_HOURS", 0,
                "MISSING_WIND_SCALE", 1));
    }

    public AiBriefDto aiBrief(String vesselId, boolean forceFallback) {
        List<CitedMetricDto> citations = aiBriefCitations(vesselId);
        BeforeAfterDto beforeAfter = beforeAfter(vesselId, underwaterEvents(vesselId).getFirst().eventId());
        String text = aiBriefText(vesselId, beforeAfter);
        if (!forceFallback) {
            AiBriefService.Result result = aiBriefService.generateBrief(
                    vesselId,
                    beforeAfter,
                    underwaterEvents(vesselId),
                    citations,
                    isLowConfidence(vesselId));
            return new AiBriefDto(
                    vesselId,
                    Instant.now(),
                    result.mode(),
                    result.text(),
                    result.citations(),
                    result.guardrail());
        }
        return new AiBriefDto(
                vesselId,
                Instant.now(),
                "deterministic-forced-fallback",
                text,
                citations,
                AiBriefGuardrail.validate(text, citations));
    }

    public AiBriefPromptDto aiBriefPrompt(String vesselId) {
        List<CitedMetricDto> citations = aiBriefCitations(vesselId);
        BeforeAfterDto beforeAfter = beforeAfter(vesselId, underwaterEvents(vesselId).getFirst().eventId());
        String text = aiBriefText(vesselId, beforeAfter);
        return new AiBriefPromptDto(
                AiBriefPrompt.systemPrompt(),
                AiBriefPrompt.buildUserPrompt(
                        vesselId, beforeAfter, underwaterEvents(vesselId), citations, isLowConfidence(vesselId)),
                citations,
                AiBriefGuardrail.validate(text, citations));
    }

    private boolean isLowConfidence(String vesselId) {
        return fleetSummary().stream()
                .filter(vessel -> vessel.vesselId().equals(vesselId))
                .findFirst()
                .map(vessel -> "LOW".equals(vessel.confidence()))
                .orElse(true);
    }

    private List<CitedMetricDto> aiBriefCitations(String vesselId) {
        BeforeAfterDto data = beforeAfter(vesselId, underwaterEvents(vesselId).getFirst().eventId());
        String beforeAfterHref = "/api/vessels/" + vesselId + "/before-after?eventId=" + data.eventId();
        double latest = performance(vesselId).getLast().speedLossPct();
        VesselSummaryDto summary = fleetSummary().stream()
                .filter(candidate -> candidate.vesselId().equals(vesselId))
                .findFirst().orElseThrow();
        List<CitedMetricDto> citations = List.of(
                new CitedMetricDto("latest_speed_loss_pct", format(latest, 2), "/api/fleet/summary"),
                new CitedMetricDto("fuel_penalty_pct", format(summary.fuelPenaltyPct(), 2),
                        "/api/fleet/summary"),
                new CitedMetricDto("median_k_before", format(data.medianKBefore(), 5), beforeAfterHref),
                new CitedMetricDto("median_k_after", format(data.medianKAfter(), 5), beforeAfterHref),
                new CitedMetricDto("recovery_pct", format(data.recoveryPct(), 2), beforeAfterHref));
        return citations;
    }

    private String aiBriefText(String vesselId, BeforeAfterDto data) {
        return vesselId + " shows speed loss under comparable conditions. "
                + "The deterministic calculation estimates " + format(performance(vesselId).getLast().speedLossPct(), 2)
                + "% speed loss [latest_speed_loss_pct] and "
                + format(fleetSummary().stream().filter(v -> v.vesselId().equals(vesselId))
                        .findFirst().orElseThrow().fuelPenaltyPct(), 2)
                + "% same-speed fuel penalty [fuel_penalty_pct]. Recommend UWILD first; "
                + "clean only when inspection evidence supports it.";
    }

    private DailyMetricDto metric(String vesselId, String date, double foc, double k, double loss, String... flags) {
        return new DailyMetricDto(vesselId, LocalDate.parse(date), foc, k, loss,
                "VLSFO", List.of(flags));
    }

    private VesselSummaryDto summary(String vesselId, double speedLoss, double hullPct,
            String confidence, int sampleDays, int daysSinceCleaning, int qualityScore,
            int priority, double slope, double fuelPenalty, int cleaningsSinceDryDock,
            Integer daysSinceDryDock, String cleaningEffectiveness, String fuelType) {
        return new VesselSummaryDto(vesselId, speedLoss, hullPct, confidence, sampleDays,
                daysSinceCleaning, qualityScore, priority, 10.0, null, null,
                null, null, null, cleaningsSinceDryDock, daysSinceDryDock,
                cleaningEffectiveness, fuelPenalty, fuelType,
                fuelPenalty <= 0.0 ? 0.0 : fuelPenalty * 10.0, slope, false);
    }

    private String format(Double value, int decimals) {
        return value == null || !Double.isFinite(value) ? "N/A" : String.format(Locale.US, "%." + decimals + "f", value);
    }

    public FuelConsumpExportDto fuelExport() {
        return new FuelConsumpExportDto(TRANSFORM_VERSION,
                "vessel_id,date,FUEL_CONSUMP,quality_flags\n"
                        + "YM-DEMO-01,2025-01-01,24.000000,HIGH_WIND|INSUFFICIENT_FULL_SPEED_HOURS\n"
                        + "YM-DEMO-02,2025-01-02,24.000000,\n"
                        + "YM-DEMO-03,2025-01-03,18.000000,\n");
    }
}
