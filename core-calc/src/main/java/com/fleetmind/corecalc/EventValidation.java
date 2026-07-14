package com.fleetmind.corecalc;

import java.util.Objects;

public final class EventValidation {
    public enum Verdict {
        CONFIRMS_EXPECTED,
        NO_CHANGE_AS_EXPECTED,
        DATA_OBSERVED,
        UNEXPECTED
    }

    private final MaintenanceEvent event;
    private final double measuredDeltaPct;
    private final double noiseThresholdPct;
    private final boolean expectedImprovement;
    private final boolean lowConfidence;
    private final Verdict verdict;

    public EventValidation(MaintenanceEvent event, double measuredDeltaPct,
            double noiseThresholdPct, boolean expectedImprovement,
            boolean lowConfidence, Verdict verdict) {
        this.event = Objects.requireNonNull(event, "event");
        this.measuredDeltaPct = measuredDeltaPct;
        this.noiseThresholdPct = noiseThresholdPct;
        this.expectedImprovement = expectedImprovement;
        this.lowConfidence = lowConfidence;
        this.verdict = Objects.requireNonNull(verdict, "verdict");
    }

    public MaintenanceEvent event() {
        return event;
    }

    public double measuredDeltaPct() {
        return measuredDeltaPct;
    }

    public double deltaPct() {
        return measuredDeltaPct;
    }

    public double noiseThresholdPct() {
        return noiseThresholdPct;
    }

    public boolean expectedImprovement() {
        return expectedImprovement;
    }

    public boolean lowConfidence() {
        return lowConfidence;
    }

    public Verdict verdict() {
        return verdict;
    }
}
