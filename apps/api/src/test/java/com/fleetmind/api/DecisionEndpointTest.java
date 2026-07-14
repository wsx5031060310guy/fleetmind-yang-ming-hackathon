package com.fleetmind.api;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class DecisionEndpointTest {
    private MockMvc mvc;
    private AlertNotificationService notifications;

    @BeforeEach
    void setUp() {
        AiBriefService aiBrief = new AiBriefService("", "");
        DemoDataService data = new DemoDataService(aiBrief) {
            @Override
            public List<VesselSummaryDto> fleetSummary() {
                return List.of(
                        summary("S11", 12.0, 82.0, 0.10, 120.0, 1),
                        summary("S8", 7.5, 55.0, 0.10, 25.0, 2),
                        summary("S23", 8.9, 90.0, -0.01, 40.0, 3));
            }
        };
        ThresholdService threshold = new ThresholdService();
        FleetDecisionService decisions = new FleetDecisionService(data, threshold);
        notifications = new AlertNotificationService("", "");
        AdminSettingsService adminSettings = new AdminSettingsService(threshold, "");
        FleetMindController controller = new FleetMindController(data, decisions, threshold,
                notifications, adminSettings);
        mvc = standaloneSetup(controller).build();
    }

    @AfterEach
    void tearDown() {
        notifications.close();
    }

    @Test
    void thresholdUpdateExpandsAlertsAndS11RemainsAct() throws Exception {
        mvc.perform(get("/api/alerts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(put("/api/config/threshold").param("value", "8"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.thresholdPct").value(8.0));

        mvc.perform(get("/api/alerts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].vesselId").value("S11"))
                .andExpect(jsonPath("$[1].vesselId").value("S23"));

        mvc.perform(get("/api/vessels/S11/decision"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACT"))
                .andExpect(jsonPath("$.recommendedAction").value("RECOMMEND_CLEANING"))
                .andExpect(jsonPath("$.rationale").value(
                        org.hamcrest.Matchers.containsString("先安排 UWILD")));
    }

    @Test
    void invalidThresholdIsBadRequestAndUnsetSnsIsSafeNoOp() throws Exception {
        mvc.perform(put("/api/config/threshold").param("value", "0"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/alerts/notify"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("disabled"))
                .andExpect(jsonPath("$.topicConfigured").value(false));
    }

    private static VesselSummaryDto summary(String vesselId, double current,
            double hullPct, double slope, double fuelPenalty, int priority) {
        return new VesselSummaryDto(vesselId, current, hullPct, "HIGH", 40,
                100, 95, priority, 10.0, null, null, null, null, null,
                2, 500, "DIMINISHING", fuelPenalty, "HFO",
                1000.0, slope, false);
    }
}
