package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/** Pure decision-support rules built on deterministic vessel metrics. */
public final class DecisionSupport {
    public static final double DEFAULT_THRESHOLD_PCT = 10.0;
    public static final int DEFAULT_ALERT_HORIZON_DAYS = 30;
    public static final int MAX_RECENT_QUALIFIED_POINTS = 30;
    public static final int MIN_CONFIDENT_POINTS = 5;
    public static final double HULL_DOMINATED_PCT = 70.0;

    public enum Status {
        NORMAL,
        WATCH,
        ACT
    }

    public enum Action {
        OBSERVE,
        SCHEDULE_UWILD,
        RECOMMEND_CLEANING
    }

    public enum CleaningEffectiveness {
        FRESH,
        DIMINISHING,
        DEPLETED
    }

    /**
     * Same-speed fuel penalty observation. Speed loss is derived as
     * {@code 100 * (1 - (1 / (1 + penalty/100))^(1/exponent))}.
     */
    public record SeriesPoint(LocalDate date, double fuelPenaltyPct, boolean qualified) {
        public SeriesPoint {
            Objects.requireNonNull(date, "date");
        }
    }

    public record Forecast(Integer daysToThreshold, Double projectedCrossValuePct,
            double currentValuePct, double slopePctPerDay, boolean lowConfidence) {
        public boolean hasCrossingForecast() {
            return daysToThreshold != null;
        }
    }

    public record Recommendation(Status status, Action action, String rationale) {
        public Recommendation {
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(action, "action");
            Objects.requireNonNull(rationale, "rationale");
        }
    }

    private DecisionSupport() {
    }

    /**
     * Fits a Theil-Sen speed-loss slope over at most 30 latest qualified observations.
     * Two points can produce a forecast, but fewer than five points are low confidence.
     */
    public static Forecast forecastDaysToThreshold(List<SeriesPoint> series,
            double thresholdPct, double exponent) {
        Objects.requireNonNull(series, "series");
        validateThreshold(thresholdPct);
        if (!Double.isFinite(exponent) || exponent <= 0.0) {
            throw new IllegalArgumentException("exponent must be positive and finite");
        }

        List<SpeedLossPoint> qualified = series.stream()
                .filter(SeriesPoint::qualified)
                .filter(point -> Double.isFinite(point.fuelPenaltyPct())
                        && point.fuelPenaltyPct() > -100.0)
                .map(point -> new SpeedLossPoint(point.date(),
                        speedLossFromFuelPenalty(point.fuelPenaltyPct(), exponent)))
                .filter(point -> Double.isFinite(point.speedLossPct()))
                .sorted(Comparator.comparing(SpeedLossPoint::date))
                .toList();
        if (qualified.size() > MAX_RECENT_QUALIFIED_POINTS) {
            qualified = qualified.subList(qualified.size() - MAX_RECENT_QUALIFIED_POINTS,
                    qualified.size());
        }
        if (qualified.isEmpty()) {
            return new Forecast(null, null, Double.NaN, Double.NaN, true);
        }

        double current = qualified.getLast().speedLossPct();
        boolean lowConfidence = qualified.size() < MIN_CONFIDENT_POINTS;
        if (current >= thresholdPct) {
            return new Forecast(0, current, current, slope(qualified), lowConfidence);
        }
        double slope = slope(qualified);
        return forecastFromTrend(current, thresholdPct, slope, lowConfidence);
    }

    /** Re-evaluates a persisted current value and slope against a live threshold. */
    public static Forecast forecastFromTrend(double currentValuePct, double thresholdPct,
            double slopePctPerDay, boolean lowConfidence) {
        validateThreshold(thresholdPct);
        if (!Double.isFinite(currentValuePct)) {
            return new Forecast(null, null, Double.NaN, slopePctPerDay, true);
        }
        if (currentValuePct >= thresholdPct) {
            return new Forecast(0, currentValuePct, currentValuePct, slopePctPerDay,
                    lowConfidence);
        }
        if (!Double.isFinite(slopePctPerDay) || slopePctPerDay <= 0.0) {
            return new Forecast(null, null, currentValuePct, slopePctPerDay, lowConfidence);
        }
        double exactDays = (thresholdPct - currentValuePct) / slopePctPerDay;
        if (!Double.isFinite(exactDays) || exactDays > Integer.MAX_VALUE) {
            return new Forecast(null, null, currentValuePct, slopePctPerDay, true);
        }
        int days = Math.max(1, (int) Math.ceil(exactDays));
        double projected = currentValuePct + slopePctPerDay * days;
        return new Forecast(days, projected, currentValuePct, slopePctPerDay, lowConfidence);
    }

    public static Recommendation recommend(double currentSpeedLossPct, double thresholdPct,
            Integer forecastDays, int alertHorizonDays, double hullSharePct,
            String confidence) {
        validateThreshold(thresholdPct);
        if (alertHorizonDays < 0) {
            throw new IllegalArgumentException("alertHorizonDays must be non-negative");
        }
        String normalizedConfidence = confidence == null
                ? "LOW" : confidence.trim().toUpperCase(Locale.ROOT);
        boolean lowConfidence = "LOW".equals(normalizedConfidence);
        if (Double.isFinite(currentSpeedLossPct) && currentSpeedLossPct >= thresholdPct) {
            if (Double.isFinite(hullSharePct) && hullSharePct >= HULL_DOMINATED_PCT
                    && !lowConfidence) {
                return new Recommendation(Status.ACT, Action.RECOMMEND_CLEANING,
                        "已達門檻且船體污損歸因高；先安排 UWILD 確認，再規劃船體清洗。");
            }
            return new Recommendation(Status.ACT, Action.SCHEDULE_UWILD,
                    "已達門檻；先安排低成本 UWILD 檢查，依檢查證據決定是否清洗。");
        }
        if (forecastDays != null && forecastDays >= 0 && forecastDays <= alertHorizonDays) {
            return new Recommendation(Status.WATCH, Action.SCHEDULE_UWILD,
                    "預估於警戒期內跨越門檻；先排程 UWILD，不將檢查視為清洗。");
        }
        return new Recommendation(Status.NORMAL, Action.OBSERVE,
                "目前低於門檻，且警戒期內無跨越預測；持續觀察。");
    }

    /** 0-1 cleanings: fresh; 2-3: diminishing; 4+: depleted. */
    public static CleaningEffectiveness cleaningEffectiveness(int cleaningsSinceDryDock) {
        if (cleaningsSinceDryDock < 0) {
            throw new IllegalArgumentException("cleaningsSinceDryDock must be non-negative");
        }
        if (cleaningsSinceDryDock <= 1) {
            return CleaningEffectiveness.FRESH;
        }
        if (cleaningsSinceDryDock <= 3) {
            return CleaningEffectiveness.DIMINISHING;
        }
        return CleaningEffectiveness.DEPLETED;
    }

    public static double speedLossFromFuelPenalty(double fuelPenaltyPct, double exponent) {
        if (!Double.isFinite(fuelPenaltyPct) || fuelPenaltyPct <= -100.0
                || !Double.isFinite(exponent) || exponent <= 0.0) {
            return Double.NaN;
        }
        return (1.0 - Math.pow(1.0 / (1.0 + fuelPenaltyPct / 100.0), 1.0 / exponent))
                * 100.0;
    }

    private static double slope(List<SpeedLossPoint> points) {
        if (points.size() < 2) {
            return Double.NaN;
        }
        List<Double> slopes = new ArrayList<>();
        for (int i = 0; i < points.size(); i++) {
            for (int j = i + 1; j < points.size(); j++) {
                long days = ChronoUnit.DAYS.between(points.get(i).date(), points.get(j).date());
                if (days > 0) {
                    slopes.add((points.get(j).speedLossPct()
                            - points.get(i).speedLossPct()) / days);
                }
            }
        }
        double[] values = new double[slopes.size()];
        for (int i = 0; i < slopes.size(); i++) {
            values[i] = slopes.get(i);
        }
        return SpeedLoss.median(values);
    }

    private static void validateThreshold(double thresholdPct) {
        if (!Double.isFinite(thresholdPct) || thresholdPct <= 0.0 || thresholdPct > 50.0) {
            throw new IllegalArgumentException("thresholdPct must satisfy 0 < value <= 50");
        }
    }

    private record SpeedLossPoint(LocalDate date, double speedLossPct) {
    }
}
