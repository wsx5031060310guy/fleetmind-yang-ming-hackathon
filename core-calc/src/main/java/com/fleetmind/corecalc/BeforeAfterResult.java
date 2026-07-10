package com.fleetmind.corecalc;

import java.util.Objects;

public final class BeforeAfterResult {
    private final double medianKBefore;
    private final double medianKAfter;
    private final double recoveryPct;
    private final int qualifiedBeforeDays;
    private final int qualifiedAfterDays;
    private final boolean lowConfidence;
    private final ReferenceWindow afterReferenceWindow;

    public BeforeAfterResult(double medianKBefore, double medianKAfter, double recoveryPct,
            int qualifiedBeforeDays, int qualifiedAfterDays, boolean lowConfidence,
            ReferenceWindow afterReferenceWindow) {
        this.medianKBefore = medianKBefore;
        this.medianKAfter = medianKAfter;
        this.recoveryPct = recoveryPct;
        this.qualifiedBeforeDays = qualifiedBeforeDays;
        this.qualifiedAfterDays = qualifiedAfterDays;
        this.lowConfidence = lowConfidence;
        this.afterReferenceWindow = Objects.requireNonNull(afterReferenceWindow, "afterReferenceWindow");
    }

    public double medianKBefore() {
        return medianKBefore;
    }

    public double medianKAfter() {
        return medianKAfter;
    }

    public double recoveryPct() {
        return recoveryPct;
    }

    public int qualifiedBeforeDays() {
        return qualifiedBeforeDays;
    }

    public int qualifiedAfterDays() {
        return qualifiedAfterDays;
    }

    public boolean lowConfidence() {
        return lowConfidence;
    }

    public ReferenceWindow afterReferenceWindow() {
        return afterReferenceWindow;
    }
}
