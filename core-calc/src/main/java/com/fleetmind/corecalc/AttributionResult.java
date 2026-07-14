package com.fleetmind.corecalc;

public final class AttributionResult {
    private final double kNow;
    private final double kClean;
    private final double currentExcess;
    private final double hullRatePerDay;
    private final double propellerRatePerDay;
    private final long daysSinceHullReset;
    private final long daysSincePropellerReset;
    private final double hullShare;
    private final double propellerShare;
    private final boolean lowConfidence;
    private final boolean heuristic;

    public AttributionResult(double kNow, double kClean, double currentExcess,
            double hullRatePerDay, double propellerRatePerDay,
            long daysSinceHullReset, long daysSincePropellerReset,
            double hullShare, double propellerShare, boolean lowConfidence, boolean heuristic) {
        this.kNow = kNow;
        this.kClean = kClean;
        this.currentExcess = currentExcess;
        this.hullRatePerDay = hullRatePerDay;
        this.propellerRatePerDay = propellerRatePerDay;
        this.daysSinceHullReset = daysSinceHullReset;
        this.daysSincePropellerReset = daysSincePropellerReset;
        this.hullShare = hullShare;
        this.propellerShare = propellerShare;
        this.lowConfidence = lowConfidence;
        this.heuristic = heuristic;
    }

    public double kNow() {
        return kNow;
    }

    public double currentK() {
        return kNow;
    }

    public double kClean() {
        return kClean;
    }

    public double kCleanUsed() {
        return kClean;
    }

    public double currentExcess() {
        return currentExcess;
    }

    public double hullRatePerDay() {
        return hullRatePerDay;
    }

    public double hullRate() {
        return hullRatePerDay;
    }

    public double propellerRatePerDay() {
        return propellerRatePerDay;
    }

    public double propellerRate() {
        return propellerRatePerDay;
    }

    public long daysSinceHullReset() {
        return daysSinceHullReset;
    }

    public long daysSincePropellerReset() {
        return daysSincePropellerReset;
    }

    public long daysSincePropReset() {
        return daysSincePropellerReset;
    }

    public double hullShare() {
        return hullShare;
    }

    public double propellerShare() {
        return propellerShare;
    }

    public double propShare() {
        return propellerShare;
    }

    public boolean lowConfidence() {
        return lowConfidence;
    }

    public boolean heuristic() {
        return heuristic;
    }
}
