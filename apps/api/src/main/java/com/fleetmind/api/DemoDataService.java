package com.fleetmind.api;

import com.fleetmind.corecalc.BusinessImpact;
import com.fleetmind.corecalc.BusinessImpactResult;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Service
public class DemoDataService {
    private static final String TRANSFORM_VERSION = "demo-static-v1";

    public List<VesselSummaryDto> fleetSummary() {
        return List.of(
                new VesselSummaryDto("YM-DEMO-01", 4.76, 68.0, "HIGH", 37, 92, 1),
                new VesselSummaryDto("YM-DEMO-02", 2.10, 41.0, "MEDIUM", 84, 88, 2),
                new VesselSummaryDto("YM-DEMO-03", 0.00, 0.0, "LOW", 12, 75, 3));
    }

    public List<DailyMetricDto> performance(String vesselId) {
        return List.of(
                new DailyMetricDto(vesselId, LocalDate.parse("2025-01-01"), 58.0, 0.00725, 0.00, List.of()),
                new DailyMetricDto(vesselId, LocalDate.parse("2025-02-01"), 59.4, 0.00743, 1.92, List.of()),
                new DailyMetricDto(vesselId, LocalDate.parse("2025-03-01"), 61.0, 0.00763, 4.76, List.of("HIGH_WIND")),
                new DailyMetricDto(vesselId, LocalDate.parse("2025-04-01"), 57.8, 0.00722, -0.20, List.of()));
    }

    public List<UnderwaterEventDto> underwaterEvents(String vesselId) {
        return List.of(
                new UnderwaterEventDto("event-2025-03-cleaning", vesselId, LocalDate.parse("2025-03-15"), "cleaning"),
                new UnderwaterEventDto("event-2025-04-polishing", vesselId, LocalDate.parse("2025-04-10"), "propeller_polishing"));
    }

    public BeforeAfterDto beforeAfter(String vesselId, String eventId) {
        BusinessImpactResult impact = BusinessImpact.estimate(58.0, 61.0, 525.0, 40000.0, 80.0, 0.5);
        return new BeforeAfterDto(
                eventId == null ? "event-2025-03-cleaning" : eventId,
                vesselId,
                0.00763,
                0.00722,
                5.37,
                impact);
    }

    public DataQualityDto dataQuality() {
        return new DataQualityDto(3, 3, Map.of(
                "HIGH_WIND", 1,
                "INSUFFICIENT_FULL_SPEED_HOURS", 1,
                "INVALID_FULL_SPEED_HOURS", 0));
    }

    public AiBriefDto aiBrief(String vesselId) {
        List<CitedMetricDto> citations = List.of(
                new CitedMetricDto("latest_speed_loss_pct", "4.76", "/api/fleet/summary"),
                new CitedMetricDto("payback_days", "20.53", "/api/vessels/" + vesselId + "/before-after?eventId=event-2025-03-cleaning"));
        String text = "YM-DEMO-01 shows elevated speed loss under comparable conditions. "
                + "The deterministic calculation estimates 4.76% speed loss and about 20.53 days payback "
                + "under the stated fuel, carbon, and cleaning-cost assumptions. Recommend human review for inspection, "
                + "then cleaning or propeller polishing if onboard evidence matches.";
        return new AiBriefDto(vesselId, Instant.now(), "deterministic-fallback", text, citations);
    }

    public FuelConsumpExportDto fuelExport() {
        return new FuelConsumpExportDto(TRANSFORM_VERSION,
                "vessel_id,date,FUEL_CONSUMP,quality_flags\n"
                        + "YM-DEMO-01,2025-01-01,24.000000,HIGH_WIND|INSUFFICIENT_FULL_SPEED_HOURS\n"
                        + "YM-DEMO-02,2025-01-02,24.000000,\n"
                        + "YM-DEMO-03,2025-01-03,18.000000,\n");
    }
}
