package com.fleetmind.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RealDataServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void parsesGeneratedMetricsShapeWithFiniteRealVesselSummary() throws Exception {
        Path metrics = temporaryDirectory.resolve("real-metrics.json");
        Files.writeString(metrics, """
                {
                  "fleet": [{
                    "vesselId": "S1",
                    "latestSpeedLossPct": 3.25,
                    "foulingAttributionPct": 62.0,
                    "confidence": "HIGH",
                    "sampleDays": 20,
                    "daysSinceLastCleaning": 42,
                    "dataQualityScore": 90,
                    "reviewPriority": 1,
                    "thresholdPct": 10.0,
                    "forecastDaysToThreshold": 20,
                    "projectedCrossValuePct": 10.1,
                    "trendSlopePctPerDay": 0.05,
                    "forecastLowConfidence": false,
                    "status": "WATCH",
                    "recommendedAction": "SCHEDULE_UWILD",
                    "rationale": "forecast crossing",
                    "cleaningsSinceDryDock": 2,
                    "daysSinceDryDock": 400,
                    "cleaningEffectiveness": "DIMINISHING",
                    "fuelPenaltyPct": 11.0,
                    "activeFuelType": "HFO",
                    "estimatedAnnualExcessFuelMt": 1200.0
                  }],
                  "vessels": {
                    "S1": {
                      "performance": [{
                        "vesselId": "S1", "date": "2025-01-01",
                        "dailyFoc": 50.0, "kValue": 0.01,
                        "speedLossPct": 3.25, "activeFuelType": "HFO",
                        "qualityFlags": []
                      }],
                      "events": [{
                        "eventId": "event-S1-UWI-1", "vesselId": "S1",
                        "date": "2025-01-01", "type": "UWI",
                        "eventType": "UWI", "verdict": "NO_CHANGE_AS_EXPECTED",
                        "expectedImprovement": false, "measuredDeltaPct": 0.1,
                        "noiseThresholdPct": 1.0, "lowConfidence": false
                      }],
                      "beforeAfter": {
                        "event-S1-UWI-1": {
                          "eventId": "event-S1-UWI-1", "vesselId": "S1",
                          "medianKBefore": 0.01, "medianKAfter": 0.01,
                          "recoveryPct": 0.0
                        }
                      },
                      "attribution": {"hullPct": 62.0, "propPct": 38.0,
                        "heuristic": false, "lowConfidence": false},
                      "decision": {"status": "WATCH"},
                      "fuelImpact": {"fuelPenaltyPct": 11.0,
                        "estimatedAnnualExcessFuelMt": 1200.0}
                    }
                  },
                  "dataQuality": {"totalRows": 1, "exportedRows": 1, "flagCounts": {}}
                }
                """);
        AiBriefService aiBriefService = new AiBriefService("", "");
        DemoDataService demo = new DemoDataService(aiBriefService);

        RealDataService service = new RealDataService(metrics, new ObjectMapper(),
                aiBriefService, demo);

        assertFalse(service.fleetSummary().isEmpty());
        assertTrue(Double.isFinite(service.fleetSummary().getFirst().latestSpeedLossPct()));
        assertTrue(service.fleetSummary().getFirst().vesselId().startsWith("S"));
        assertTrue("DIMINISHING".equals(
                service.fleetSummary().getFirst().cleaningEffectiveness()));
        assertTrue("HFO".equals(service.performance("S1").getFirst().activeFuelType()));
    }

    @Test
    void missingMetricsConfigurationKeepsDemoProvider() throws Exception {
        AiBriefService aiBriefService = new AiBriefService("", "");
        DemoDataService demo = new DemoDataService(aiBriefService);

        FleetDataProvider selected = new FleetDataConfiguration().fleetDataProvider(
                "", new ObjectMapper(), aiBriefService, demo);

        assertSame(demo, selected);
        assertTrue(selected.fleetSummary().getFirst().vesselId().startsWith("YM-DEMO-"));
    }
}
