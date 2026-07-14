package com.fleetmind.api;

import java.time.LocalDate;
import java.util.List;

public record DailyMetricDto(
        String vesselId,
        LocalDate date,
        double dailyFoc,
        double kValue,
        double speedLossPct,
        String activeFuelType,
        List<String> qualityFlags) {

    public DailyMetricDto(String vesselId, LocalDate date, double dailyFoc,
            double kValue, double speedLossPct, List<String> qualityFlags) {
        this(vesselId, date, dailyFoc, kValue, speedLossPct, "UNKNOWN", qualityFlags);
    }
}
