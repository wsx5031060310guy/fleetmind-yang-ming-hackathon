package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

public final class DailyPoint {
    private final LocalDate date;
    private final double dailyFoc;
    private final double speedKnots;
    private final EnumSet<QualityFlag> qualityFlags;

    public DailyPoint(LocalDate date, double dailyFoc, double speedKnots, Set<QualityFlag> qualityFlags) {
        this.date = Objects.requireNonNull(date, "date");
        Objects.requireNonNull(qualityFlags, "qualityFlags");
        this.dailyFoc = dailyFoc;
        this.speedKnots = speedKnots;
        this.qualityFlags = qualityFlags.isEmpty()
                ? EnumSet.noneOf(QualityFlag.class)
                : EnumSet.copyOf(qualityFlags);
    }

    public LocalDate date() {
        return date;
    }

    public double dailyFoc() {
        return dailyFoc;
    }

    public double speedKnots() {
        return speedKnots;
    }

    public Set<QualityFlag> qualityFlags() {
        return Collections.unmodifiableSet(qualityFlags);
    }
}
