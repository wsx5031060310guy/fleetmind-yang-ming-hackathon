package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

public final class DailyMetric {
    private final String vesselId;
    private final LocalDate date;
    private final double dailyFoc;
    private final EnumSet<QualityFlag> qualityFlags;

    public DailyMetric(String vesselId, LocalDate date, double dailyFoc, Set<QualityFlag> qualityFlags) {
        this.vesselId = vesselId;
        this.date = date;
        this.dailyFoc = dailyFoc;
        this.qualityFlags = qualityFlags.isEmpty()
                ? EnumSet.noneOf(QualityFlag.class)
                : EnumSet.copyOf(qualityFlags);
    }

    public String vesselId() {
        return vesselId;
    }

    public LocalDate date() {
        return date;
    }

    public double dailyFoc() {
        return dailyFoc;
    }

    public Set<QualityFlag> qualityFlags() {
        return Collections.unmodifiableSet(qualityFlags);
    }
}
