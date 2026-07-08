package com.fleetmind.corecalc;

import java.util.Collection;
import java.util.EnumSet;
import java.util.Objects;

public final class CoreCalc {
    private CoreCalc() {
    }

    public static double vlsfoEquivalent(Collection<FuelMass> fuels) {
        Objects.requireNonNull(fuels, "fuels");
        double total = 0.0;
        for (FuelMass fuel : fuels) {
            Objects.requireNonNull(fuel, "fuel");
            if (!Double.isFinite(fuel.massMetricTons()) || fuel.massMetricTons() < 0.0) {
                throw new IllegalArgumentException("fuel mass must be non-negative and finite");
            }
            total += fuel.massMetricTons() * fuel.type().lcv() / FuelType.VLSFO.lcv();
        }
        return total;
    }

    public static double dailyFoc(double meFullspeedConsumpVlsfo, double hoursFullSpeed) {
        if (!Double.isFinite(meFullspeedConsumpVlsfo) || meFullspeedConsumpVlsfo < 0.0) {
            return Double.NaN;
        }
        if (!Double.isFinite(hoursFullSpeed) || hoursFullSpeed <= 0.0) {
            return Double.NaN;
        }
        return meFullspeedConsumpVlsfo / hoursFullSpeed * 24.0;
    }

    public static EnumSet<QualityFlag> qualityFlags(Integer windScale, Double hoursFullSpeed) {
        EnumSet<QualityFlag> flags = EnumSet.noneOf(QualityFlag.class);
        if (windScale == null) {
            flags.add(QualityFlag.MISSING_WIND_SCALE);
        } else if (windScale > 4) {
            flags.add(QualityFlag.HIGH_WIND);
        }

        if (hoursFullSpeed == null || !Double.isFinite(hoursFullSpeed) || hoursFullSpeed <= 0.0) {
            flags.add(QualityFlag.INVALID_FULL_SPEED_HOURS);
        } else if (hoursFullSpeed < 22.0) {
            flags.add(QualityFlag.INSUFFICIENT_FULL_SPEED_HOURS);
        }
        return flags;
    }

    public static double kValue(double dailyFoc, double speedKnots) {
        if (!Double.isFinite(dailyFoc) || dailyFoc < 0.0) {
            return Double.NaN;
        }
        if (!Double.isFinite(speedKnots) || speedKnots <= 0.0) {
            return Double.NaN;
        }
        return dailyFoc / Math.pow(speedKnots, 3.0);
    }

    public static double speedLossPct(double kRef, double kObserved, double exponent) {
        if (!Double.isFinite(kRef) || !Double.isFinite(kObserved) || !Double.isFinite(exponent)) {
            return Double.NaN;
        }
        if (kRef <= 0.0 || kObserved <= 0.0 || exponent <= 0.0) {
            return Double.NaN;
        }
        return (1.0 - Math.pow(kRef / kObserved, 1.0 / exponent)) * 100.0;
    }

    public static DailyMetric dailyMetric(NoonReportDaily report) {
        Objects.requireNonNull(report, "report");
        double dailyFoc = dailyFoc(report.meFullspeedConsumpVlsfo(), report.hoursFullSpeed());
        EnumSet<QualityFlag> flags = qualityFlags(report.windScale(), report.hoursFullSpeed());
        return new DailyMetric(report.vesselId(), report.date(), dailyFoc, flags);
    }
}
