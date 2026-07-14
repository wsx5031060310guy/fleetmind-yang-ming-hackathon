package com.fleetmind.corecalc;

public final class EventImpact {
    private final double medianKBefore;
    private final double medianKAfter;
    private final double deltaK;
    private final double deltaPct;
    private final int qualifiedBeforeDays;
    private final int qualifiedAfterDays;
    private final boolean lowConfidence;
    private final boolean expectedImprovement;

    public EventImpact(double deltaK, double deltaPct, boolean lowConfidence, boolean expectedImprovement) {
        this(Double.NaN, Double.NaN, deltaK, deltaPct, 0, 0, lowConfidence, expectedImprovement);
    }

    public EventImpact(double medianKBefore, double medianKAfter, double deltaK, double deltaPct,
            int qualifiedBeforeDays, int qualifiedAfterDays, boolean lowConfidence,
            boolean expectedImprovement) {
        this.medianKBefore = medianKBefore;
        this.medianKAfter = medianKAfter;
        this.deltaK = deltaK;
        this.deltaPct = deltaPct;
        this.qualifiedBeforeDays = qualifiedBeforeDays;
        this.qualifiedAfterDays = qualifiedAfterDays;
        this.lowConfidence = lowConfidence;
        this.expectedImprovement = expectedImprovement;
    }

    public double medianKBefore() {
        return medianKBefore;
    }

    public double medianKAfter() {
        return medianKAfter;
    }

    public double kBefore() {
        return medianKBefore;
    }

    public double kAfter() {
        return medianKAfter;
    }

    public double deltaK() {
        return deltaK;
    }

    public double deltaPct() {
        return deltaPct;
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

    public boolean expectedImprovement() {
        return expectedImprovement;
    }
}
