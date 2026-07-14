package com.fleetmind.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FleetDecisionServiceTest {
    @Test
    void liveThresholdRecomputesForecastAndStatusWithoutRegeneratingMetrics() {
        ThresholdService threshold = new ThresholdService();
        DemoDataService data = new DemoDataService(new AiBriefService("", ""));
        FleetDecisionService decisions = new FleetDecisionService(data, threshold);

        assertTrue(decisions.alerts().isEmpty());
        threshold.set(7.0);

        DecisionDto alert = decisions.alerts().getFirst();
        assertEquals("YM-DEMO-01", alert.vesselId());
        assertEquals("WATCH", alert.status());
        assertEquals("SCHEDULE_UWILD", alert.recommendedAction());

        threshold.set(4.0);
        assertEquals("ACT", decisions.decision("YM-DEMO-01").status());
    }

    @Test
    void thresholdValidationRejectsOutOfRangeValues() {
        ThresholdService threshold = new ThresholdService();
        assertThrows(ThresholdService.ThresholdValidationException.class,
                () -> threshold.set(0.0));
        assertThrows(ThresholdService.ThresholdValidationException.class,
                () -> threshold.set(50.1));
        assertEquals(10.0, threshold.get());
    }
}
