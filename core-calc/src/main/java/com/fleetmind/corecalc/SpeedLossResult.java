package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

public final class SpeedLossResult {
    private final List<LocalDate> dates;
    private final double[] kValues;
    private final double[] speedLossPct;
    private final ReferenceWindow referenceWindow;
    private final double theilSenSlopePerDay;

    public SpeedLossResult(List<LocalDate> dates, double[] kValues, double[] speedLossPct,
            ReferenceWindow referenceWindow, double theilSenSlopePerDay) {
        Objects.requireNonNull(dates, "dates");
        Objects.requireNonNull(kValues, "kValues");
        Objects.requireNonNull(speedLossPct, "speedLossPct");
        this.referenceWindow = Objects.requireNonNull(referenceWindow, "referenceWindow");
        if (dates.size() != kValues.length || dates.size() != speedLossPct.length) {
            throw new IllegalArgumentException("per-day arrays must have equal lengths");
        }
        this.dates = List.copyOf(dates);
        this.kValues = kValues.clone();
        this.speedLossPct = speedLossPct.clone();
        this.theilSenSlopePerDay = theilSenSlopePerDay;
    }

    public List<LocalDate> dates() {
        return dates;
    }

    public double[] kValues() {
        return kValues.clone();
    }

    public double[] speedLossPct() {
        return speedLossPct.clone();
    }

    public ReferenceWindow referenceWindow() {
        return referenceWindow;
    }

    public double theilSenSlopePerDay() {
        return theilSenSlopePerDay;
    }
}
