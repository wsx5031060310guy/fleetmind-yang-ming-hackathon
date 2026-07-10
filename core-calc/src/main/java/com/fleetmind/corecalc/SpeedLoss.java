package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

public final class SpeedLoss {
    public static final int DEFAULT_REFERENCE_MIN_DAYS = 10;
    public static final int DEFAULT_REFERENCE_MAX_DAYS = 15;
    public static final int DEFAULT_REFERENCE_CALENDAR_CAP_DAYS = 60;
    public static final double DEFAULT_SPEED_BAND_KNOTS = 1.0;
    public static final int DEFAULT_ROLLING_MEDIAN_WINDOW = 5;
    public static final double DEFAULT_EXPONENT = 3.0;
    public static final int DEFAULT_BEFORE_AFTER_MIN_QUALIFIED_DAYS = 5;

    private SpeedLoss() {
    }

    public static double median(double[] values) {
        Objects.requireNonNull(values, "values");
        if (values.length == 0) {
            return Double.NaN;
        }
        double[] sorted = values.clone();
        Arrays.sort(sorted);
        int middle = sorted.length / 2;
        if ((sorted.length & 1) == 1) {
            return sorted[middle];
        }
        return sorted[middle - 1] / 2.0 + sorted[middle] / 2.0;
    }

    public static ReferenceWindow referenceWindow(
            List<DailyPoint> points, int minDays, int maxDays, int calendarCapDays) {
        Objects.requireNonNull(points, "points");
        if (minDays < 0 || maxDays <= 0 || minDays > maxDays || calendarCapDays <= 0) {
            throw new IllegalArgumentException("invalid reference-window parameters");
        }

        List<DailyPoint> chosen = new ArrayList<>();
        LocalDate firstQualifiedDate = null;
        for (DailyPoint point : points) {
            Objects.requireNonNull(point, "point");
            if (firstQualifiedDate != null
                    && ChronoUnit.DAYS.between(firstQualifiedDate, point.date()) >= calendarCapDays) {
                break;
            }
            if (!isQualified(point)) {
                continue;
            }
            if (firstQualifiedDate == null) {
                firstQualifiedDate = point.date();
            }
            chosen.add(point);
            if (chosen.size() == maxDays) {
                break;
            }
        }

        double[] kValues = new double[chosen.size()];
        double[] speeds = new double[chosen.size()];
        for (int i = 0; i < chosen.size(); i++) {
            DailyPoint point = chosen.get(i);
            kValues[i] = CoreCalc.kValue(point.dailyFoc(), point.speedKnots());
            speeds[i] = point.speedKnots();
        }
        return new ReferenceWindow(chosen, median(kValues), median(speeds), chosen.size() < minDays);
    }

    public static List<DailyPoint> sameSpeedBand(
            List<DailyPoint> points, double refSpeedMedian, double bandKnots) {
        Objects.requireNonNull(points, "points");
        if (!Double.isFinite(bandKnots) || bandKnots < 0.0) {
            throw new IllegalArgumentException("bandKnots must be non-negative and finite");
        }
        if (!Double.isFinite(refSpeedMedian)) {
            return List.of();
        }
        List<DailyPoint> selected = new ArrayList<>();
        for (DailyPoint point : points) {
            Objects.requireNonNull(point, "point");
            if (Double.isFinite(point.speedKnots())
                    && Math.abs(point.speedKnots() - refSpeedMedian) <= bandKnots) {
                selected.add(point);
            }
        }
        return List.copyOf(selected);
    }

    public static double[] rollingMedian(double[] values, int window) {
        Objects.requireNonNull(values, "values");
        if (window <= 0) {
            throw new IllegalArgumentException("window must be positive");
        }
        double[] result = new double[values.length];
        int left = (window - 1) / 2;
        int right = window / 2;
        for (int i = 0; i < values.length; i++) {
            int start = Math.max(0, i - left);
            int end = Math.min(values.length, i + right + 1);
            double[] finite = new double[end - start];
            int count = 0;
            for (int j = start; j < end; j++) {
                if (Double.isFinite(values[j])) {
                    finite[count++] = values[j];
                }
            }
            result[i] = count == 0 ? Double.NaN : median(Arrays.copyOf(finite, count));
        }
        return result;
    }

    public static double theilSenSlopePerDay(List<LocalDate> dates, double[] kValues) {
        Objects.requireNonNull(dates, "dates");
        Objects.requireNonNull(kValues, "kValues");
        if (dates.size() != kValues.length) {
            throw new IllegalArgumentException("dates and kValues must have equal lengths");
        }
        List<Double> slopes = new ArrayList<>();
        for (int i = 0; i < kValues.length; i++) {
            Objects.requireNonNull(dates.get(i), "date");
            if (!Double.isFinite(kValues[i])) {
                continue;
            }
            for (int j = i + 1; j < kValues.length; j++) {
                Objects.requireNonNull(dates.get(j), "date");
                if (!Double.isFinite(kValues[j])) {
                    continue;
                }
                long days = ChronoUnit.DAYS.between(dates.get(i), dates.get(j));
                if (days != 0) {
                    slopes.add((kValues[j] - kValues[i]) / days);
                }
            }
        }
        if (slopes.isEmpty()) {
            return Double.NaN;
        }
        double[] values = new double[slopes.size()];
        for (int i = 0; i < slopes.size(); i++) {
            values[i] = slopes.get(i);
        }
        return median(values);
    }

    public static SpeedLossResult speedLossSeries(
            List<DailyPoint> points, ReferenceWindow ref, double exponent) {
        Objects.requireNonNull(points, "points");
        Objects.requireNonNull(ref, "ref");
        List<LocalDate> dates = new ArrayList<>(points.size());
        double[] kValues = new double[points.size()];
        double[] losses = new double[points.size()];
        List<LocalDate> slopeDates = new ArrayList<>();
        List<Double> slopeKValues = new ArrayList<>();

        for (int i = 0; i < points.size(); i++) {
            DailyPoint point = Objects.requireNonNull(points.get(i), "point");
            dates.add(point.date());
            double k = isQualified(point)
                    ? CoreCalc.kValue(point.dailyFoc(), point.speedKnots())
                    : Double.NaN;
            kValues[i] = k;
            losses[i] = Double.isFinite(k)
                    ? CoreCalc.speedLossPct(ref.kRef(), k, exponent)
                    : Double.NaN;
            if (Double.isFinite(k) && Double.isFinite(ref.refSpeedMedian())
                    && Math.abs(point.speedKnots() - ref.refSpeedMedian()) <= DEFAULT_SPEED_BAND_KNOTS) {
                slopeDates.add(point.date());
                slopeKValues.add(k);
            }
        }

        double[] slopeValues = new double[slopeKValues.size()];
        for (int i = 0; i < slopeValues.length; i++) {
            slopeValues[i] = slopeKValues.get(i);
        }
        return new SpeedLossResult(dates, kValues, losses, ref,
                theilSenSlopePerDay(slopeDates, slopeValues));
    }

    public static BeforeAfterResult beforeAfter(
            List<DailyPoint> all, LocalDate eventDate, int lookbackDays, int minQualifiedEachSide) {
        Objects.requireNonNull(all, "all");
        Objects.requireNonNull(eventDate, "eventDate");
        if (lookbackDays < 0 || minQualifiedEachSide < 0) {
            throw new IllegalArgumentException("day counts must be non-negative");
        }
        LocalDate beforeStart = eventDate.minusDays(lookbackDays);
        List<Double> beforeK = new ArrayList<>();
        List<DailyPoint> afterCandidates = new ArrayList<>();
        for (DailyPoint point : all) {
            Objects.requireNonNull(point, "point");
            if (!point.date().isBefore(beforeStart) && point.date().isBefore(eventDate) && isQualified(point)) {
                beforeK.add(CoreCalc.kValue(point.dailyFoc(), point.speedKnots()));
            } else if (point.date().isAfter(eventDate)) {
                afterCandidates.add(point);
            }
        }
        ReferenceWindow after = referenceWindow(afterCandidates, DEFAULT_REFERENCE_MIN_DAYS,
                DEFAULT_REFERENCE_MAX_DAYS, DEFAULT_REFERENCE_CALENDAR_CAP_DAYS);
        double medianBefore = median(toArray(beforeK));
        double medianAfter = after.kRef();
        double recovery = !Double.isFinite(medianBefore) || !Double.isFinite(medianAfter) || medianBefore <= 0.0
                ? Double.NaN
                : (medianBefore - medianAfter) / medianBefore * 100.0;
        boolean lowConfidence = beforeK.size() < minQualifiedEachSide
                || after.points().size() < minQualifiedEachSide;
        return new BeforeAfterResult(medianBefore, medianAfter, recovery, beforeK.size(),
                after.points().size(), lowConfidence, after);
    }

    public static double fuelPenaltyPct(double kObserved, double kRef) {
        if (!Double.isFinite(kObserved) || !Double.isFinite(kRef) || kRef <= 0.0) {
            return Double.NaN;
        }
        return (kObserved - kRef) / kRef * 100.0;
    }

    private static boolean isQualified(DailyPoint point) {
        return point.qualityFlags().isEmpty()
                && Double.isFinite(point.dailyFoc())
                && point.dailyFoc() > 0.0
                && Double.isFinite(point.speedKnots())
                && point.speedKnots() > 0.0;
    }

    private static double[] toArray(List<Double> values) {
        double[] result = new double[values.size()];
        for (int i = 0; i < values.size(); i++) {
            result[i] = values.get(i);
        }
        return result;
    }
}
