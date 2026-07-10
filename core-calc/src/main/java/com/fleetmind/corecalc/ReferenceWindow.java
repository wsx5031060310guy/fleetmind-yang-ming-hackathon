package com.fleetmind.corecalc;

import java.util.List;
import java.util.Objects;

public final class ReferenceWindow {
    private final List<DailyPoint> points;
    private final double kRef;
    private final double refSpeedMedian;
    private final boolean lowConfidence;

    public ReferenceWindow(List<DailyPoint> points, double kRef, double refSpeedMedian, boolean lowConfidence) {
        Objects.requireNonNull(points, "points");
        this.points = List.copyOf(points);
        this.kRef = kRef;
        this.refSpeedMedian = refSpeedMedian;
        this.lowConfidence = lowConfidence;
    }

    public List<DailyPoint> points() {
        return points;
    }

    public double kRef() {
        return kRef;
    }

    public double refSpeedMedian() {
        return refSpeedMedian;
    }

    public boolean lowConfidence() {
        return lowConfidence;
    }
}
