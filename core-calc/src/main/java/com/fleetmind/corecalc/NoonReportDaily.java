package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.Objects;

public final class NoonReportDaily {
    private final String vesselId;
    private final LocalDate date;
    private final Integer windScale;
    private final double meFullspeedConsumpVlsfo;
    private final double hoursFullSpeed;

    public NoonReportDaily(
            String vesselId,
            LocalDate date,
            Integer windScale,
            double meFullspeedConsumpVlsfo,
            double hoursFullSpeed) {
        this.vesselId = Objects.requireNonNull(vesselId, "vesselId");
        this.date = Objects.requireNonNull(date, "date");
        this.windScale = windScale;
        this.meFullspeedConsumpVlsfo = meFullspeedConsumpVlsfo;
        this.hoursFullSpeed = hoursFullSpeed;
    }

    public String vesselId() {
        return vesselId;
    }

    public LocalDate date() {
        return date;
    }

    public Integer windScale() {
        return windScale;
    }

    public double meFullspeedConsumpVlsfo() {
        return meFullspeedConsumpVlsfo;
    }

    public double hoursFullSpeed() {
        return hoursFullSpeed;
    }
}
