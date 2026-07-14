package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * ISO 19030-style hull and propeller performance attribution for daily noon reports.
 * ISO 19030 concepts used here are reference conditions, expected performance, and a
 * performance value expressed as percentage speed loss. Because noon reports do not
 * provide ISO-grade shaft power and high-frequency speed-through-water observations,
 * this implementation explicitly maps {@code k = Daily FOC / V^3} to the performance
 * value proxy. It applies common-speed reference windows, robust medians, Theil-Sen
 * trends, and maintenance-event resets; it is an ISO 19030-style methodology on
 * noon-report granularity, not a claim of full ISO 19030 compliance.
 */
public final class Attribution {
    private Attribution() {
    }

    public static EventImpact eventImpact(List<DailyPoint> points, MaintenanceEvent event,
            int windowDays, int minQualifiedEachSide) {
        Objects.requireNonNull(points, "points");
        Objects.requireNonNull(event, "event");
        if (windowDays < 0 || minQualifiedEachSide < 0) {
            throw new IllegalArgumentException("day counts must be non-negative");
        }

        WindowStats stats = eventWindowStats(points, event, windowDays);
        double deltaK = finite(stats.medianKBefore) && finite(stats.medianKAfter)
                ? stats.medianKBefore - stats.medianKAfter
                : Double.NaN;
        double deltaPct = finite(deltaK) && stats.medianKBefore > 0.0
                ? deltaK / stats.medianKBefore * 100.0
                : Double.NaN;
        boolean lowConfidence = stats.beforeK.length < minQualifiedEachSide
                || stats.afterK.length < minQualifiedEachSide
                || !finite(deltaPct);
        boolean expectedImprovement = resetsAnything(event);
        return new EventImpact(stats.medianKBefore, stats.medianKAfter, deltaK, deltaPct,
                stats.beforeK.length, stats.afterK.length, lowConfidence, expectedImprovement);
    }

    public static AttributionResult attribute(List<DailyPoint> points,
            List<MaintenanceEvent> events, double kClean) {
        Objects.requireNonNull(points, "points");
        Objects.requireNonNull(events, "events");
        List<DailyPoint> orderedPoints = sortedPoints(points);
        List<MaintenanceEvent> orderedEvents = sortedEvents(events);

        DailyPoint currentPoint = latestQualified(orderedPoints);
        double kNow = currentPoint == null
                ? Double.NaN
                : CoreCalc.kValue(currentPoint.dailyFoc(), currentPoint.speedKnots());

        ReferenceWindow cleanWindow = cleanReferenceWindow(orderedPoints, orderedEvents,
                currentPoint == null ? null : currentPoint.date());
        double derivedKClean = cleanWindow.kRef();
        double effectiveKClean = finite(derivedKClean) && derivedKClean > 0.0
                ? derivedKClean
                : finite(kClean) && kClean > 0.0 ? kClean : Double.NaN;
        double currentExcess = finite(kNow) && finite(effectiveKClean)
                ? kNow - effectiveKClean
                : Double.NaN;

        double hullRate = estimateDominantRate(orderedPoints, orderedEvents, true);
        double propellerRate = estimateDominantRate(orderedPoints, orderedEvents, false);
        LocalDate currentDate = currentPoint == null ? null : currentPoint.date();
        LocalDate firstQualifiedDate = firstQualifiedDate(orderedPoints);
        long daysSinceHullReset = daysSinceReset(orderedEvents, currentDate,
                firstQualifiedDate, true);
        long daysSincePropellerReset = daysSinceReset(orderedEvents, currentDate,
                firstQualifiedDate, false);

        double hullContribution = contribution(hullRate, daysSinceHullReset);
        double propellerContribution = contribution(propellerRate, daysSincePropellerReset);
        double totalContribution = hullContribution + propellerContribution;
        boolean heuristic = !finite(hullRate) || !finite(propellerRate)
                || !finite(totalContribution) || totalContribution <= 0.0;
        double hullShare;
        double propellerShare;
        if (heuristic) {
            hullShare = 0.5;
            propellerShare = 0.5;
        } else {
            hullShare = clamp01(hullContribution / totalContribution);
            propellerShare = clamp01(1.0 - hullShare);
        }

        boolean baselineLowConfidence = cleanWindow.lowConfidence()
                || !finite(effectiveKClean) || effectiveKClean <= 0.0;
        boolean lowConfidence = heuristic || baselineLowConfidence || !finite(kNow);
        return new AttributionResult(kNow, effectiveKClean, currentExcess,
                hullRate, propellerRate, daysSinceHullReset, daysSincePropellerReset,
                hullShare, propellerShare, lowConfidence, heuristic);
    }

    public static List<EventValidation> validateEvents(List<DailyPoint> points,
            List<MaintenanceEvent> events, int windowDays) {
        Objects.requireNonNull(points, "points");
        Objects.requireNonNull(events, "events");
        if (windowDays < 0) {
            throw new IllegalArgumentException("windowDays must be non-negative");
        }

        List<EventValidation> validations = new ArrayList<>(events.size());
        for (MaintenanceEvent event : events) {
            Objects.requireNonNull(event, "event");
            WindowStats stats = eventWindowStats(points, event, windowDays);
            EventImpact impact = eventImpact(points, event, windowDays,
                    SpeedLoss.DEFAULT_BEFORE_AFTER_MIN_QUALIFIED_DAYS);
            double mad = medianAbsoluteDeviation(stats.beforeK, stats.medianKBefore);
            double noiseThresholdPct = finite(mad) && finite(stats.medianKBefore)
                    && stats.medianKBefore > 0.0
                    ? mad / stats.medianKBefore * 100.0
                    : Double.NaN;
            EventValidation.Verdict verdict = verdict(impact.deltaPct(), noiseThresholdPct,
                    impact.expectedImprovement());
            boolean lowConfidence = impact.lowConfidence() || !finite(noiseThresholdPct);
            validations.add(new EventValidation(event, impact.deltaPct(), noiseThresholdPct,
                    impact.expectedImprovement(), lowConfidence, verdict));
        }
        return List.copyOf(validations);
    }

    private static EventValidation.Verdict verdict(double deltaPct, double thresholdPct,
            boolean expectedImprovement) {
        if (!finite(deltaPct) || !finite(thresholdPct)) {
            return EventValidation.Verdict.UNEXPECTED;
        }
        if (expectedImprovement) {
            return deltaPct > thresholdPct
                    ? EventValidation.Verdict.CONFIRMS_EXPECTED
                    : EventValidation.Verdict.UNEXPECTED;
        }
        return Math.abs(deltaPct) <= thresholdPct
                ? EventValidation.Verdict.NO_CHANGE_AS_EXPECTED
                : EventValidation.Verdict.UNEXPECTED;
    }

    private static WindowStats eventWindowStats(List<DailyPoint> points,
            MaintenanceEvent event, int windowDays) {
        LocalDate eventDate = event.date();
        List<DailyPoint> before = new ArrayList<>();
        List<DailyPoint> after = new ArrayList<>();
        for (DailyPoint point : points) {
            Objects.requireNonNull(point, "point");
            long beforeDistance = ChronoUnit.DAYS.between(point.date(), eventDate);
            long afterDistance = ChronoUnit.DAYS.between(eventDate, point.date());
            if (beforeDistance >= 1 && beforeDistance <= windowDays) {
                before.add(point);
            } else if (afterDistance >= 1 && afterDistance <= windowDays) {
                after.add(point);
            }
        }
        before.sort(Comparator.comparing(DailyPoint::date));
        after.sort(Comparator.comparing(DailyPoint::date));
        List<DailyPoint> qualifiedBefore = qualifiedPoints(before, windowDays);
        List<DailyPoint> qualifiedAfter = qualifiedPoints(after, windowDays);

        double[] speeds = new double[qualifiedBefore.size() + qualifiedAfter.size()];
        int speedCount = 0;
        for (DailyPoint point : qualifiedBefore) {
            speeds[speedCount++] = point.speedKnots();
        }
        for (DailyPoint point : qualifiedAfter) {
            speeds[speedCount++] = point.speedKnots();
        }
        double commonSpeed = SpeedLoss.median(speeds);
        List<DailyPoint> sameBandBefore = SpeedLoss.sameSpeedBand(qualifiedBefore,
                commonSpeed, SpeedLoss.DEFAULT_SPEED_BAND_KNOTS);
        List<DailyPoint> sameBandAfter = SpeedLoss.sameSpeedBand(qualifiedAfter,
                commonSpeed, SpeedLoss.DEFAULT_SPEED_BAND_KNOTS);
        double[] beforeK = kValues(sameBandBefore);
        double[] afterK = kValues(sameBandAfter);
        return new WindowStats(beforeK, afterK, SpeedLoss.median(beforeK),
                SpeedLoss.median(afterK));
    }

    private static List<DailyPoint> qualifiedPoints(List<DailyPoint> candidates, int windowDays) {
        if (candidates.isEmpty()) {
            return List.of();
        }
        int calendarCap = windowDays == Integer.MAX_VALUE ? Integer.MAX_VALUE : windowDays + 1;
        ReferenceWindow window = SpeedLoss.referenceWindow(candidates, 0,
                Math.max(1, candidates.size()), Math.max(1, calendarCap));
        return window.points();
    }

    private static ReferenceWindow cleanReferenceWindow(List<DailyPoint> points,
            List<MaintenanceEvent> events, LocalDate currentDate) {
        MaintenanceEvent latestDd = null;
        for (MaintenanceEvent event : events) {
            if (event.type() == MaintenanceEvent.EventType.DD
                    && (currentDate == null || !event.date().isAfter(currentDate))) {
                latestDd = event;
            }
        }
        List<DailyPoint> candidates = new ArrayList<>();
        for (DailyPoint point : points) {
            if (latestDd == null || point.date().isAfter(latestDd.date())) {
                candidates.add(point);
            }
        }
        return SpeedLoss.referenceWindow(candidates,
                SpeedLoss.DEFAULT_REFERENCE_MIN_DAYS,
                SpeedLoss.DEFAULT_REFERENCE_MAX_DAYS,
                SpeedLoss.DEFAULT_REFERENCE_CALENDAR_CAP_DAYS);
    }

    private static double estimateDominantRate(List<DailyPoint> points,
            List<MaintenanceEvent> events, boolean hull) {
        List<Double> segmentSlopes = new ArrayList<>();
        for (int i = 0; i < events.size(); i++) {
            MaintenanceEvent start = events.get(i);
            boolean startsIsolation = hull
                    ? start.type().resetsPropeller() && !start.type().resetsHull()
                    : start.type().resetsHull() && !start.type().resetsPropeller();
            if (!startsIsolation) {
                continue;
            }
            LocalDate endDate = null;
            for (int j = i + 1; j < events.size(); j++) {
                MaintenanceEvent candidate = events.get(j);
                if (resetsAnything(candidate)) {
                    endDate = candidate.date();
                    break;
                }
            }
            List<DailyPoint> segment = new ArrayList<>();
            for (DailyPoint point : points) {
                if (point.date().isAfter(start.date())
                        && (endDate == null || point.date().isBefore(endDate))) {
                    segment.add(point);
                }
            }
            double slope = segmentSlope(segment);
            if (finite(slope)) {
                segmentSlopes.add(Math.max(0.0, slope));
            }
        }
        return SpeedLoss.median(toArray(segmentSlopes));
    }

    private static double segmentSlope(List<DailyPoint> segment) {
        if (segment.size() < 2) {
            return Double.NaN;
        }
        ReferenceWindow qualified = SpeedLoss.referenceWindow(segment, 0,
                segment.size(), Integer.MAX_VALUE);
        List<DailyPoint> sameBand = SpeedLoss.sameSpeedBand(qualified.points(),
                qualified.refSpeedMedian(), SpeedLoss.DEFAULT_SPEED_BAND_KNOTS);
        if (sameBand.size() < 2) {
            return Double.NaN;
        }
        List<LocalDate> dates = new ArrayList<>(sameBand.size());
        double[] kValues = new double[sameBand.size()];
        for (int i = 0; i < sameBand.size(); i++) {
            DailyPoint point = sameBand.get(i);
            dates.add(point.date());
            kValues[i] = CoreCalc.kValue(point.dailyFoc(), point.speedKnots());
        }
        return SpeedLoss.theilSenSlopePerDay(dates, kValues);
    }

    private static long daysSinceReset(List<MaintenanceEvent> events, LocalDate currentDate,
            LocalDate defaultDate, boolean hull) {
        if (currentDate == null || defaultDate == null) {
            return 0L;
        }
        LocalDate resetDate = defaultDate;
        for (MaintenanceEvent event : events) {
            boolean resets = hull ? event.type().resetsHull() : event.type().resetsPropeller();
            if (resets && !event.date().isAfter(currentDate)) {
                resetDate = event.date();
            }
        }
        return Math.max(0L, ChronoUnit.DAYS.between(resetDate, currentDate));
    }

    private static DailyPoint latestQualified(List<DailyPoint> points) {
        for (int i = points.size() - 1; i >= 0; i--) {
            DailyPoint point = points.get(i);
            if (isQualified(point)) {
                return point;
            }
        }
        return null;
    }

    private static LocalDate firstQualifiedDate(List<DailyPoint> points) {
        for (DailyPoint point : points) {
            if (isQualified(point)) {
                return point.date();
            }
        }
        return null;
    }

    private static boolean isQualified(DailyPoint point) {
        return point.qualityFlags().isEmpty()
                && finite(point.dailyFoc()) && point.dailyFoc() > 0.0
                && finite(point.speedKnots()) && point.speedKnots() > 0.0;
    }

    private static double medianAbsoluteDeviation(double[] values, double median) {
        if (!finite(median) || values.length == 0) {
            return Double.NaN;
        }
        double[] deviations = new double[values.length];
        for (int i = 0; i < values.length; i++) {
            deviations[i] = Math.abs(values[i] - median);
        }
        return SpeedLoss.median(deviations);
    }

    private static double[] kValues(List<DailyPoint> points) {
        double[] values = new double[points.size()];
        for (int i = 0; i < points.size(); i++) {
            DailyPoint point = points.get(i);
            values[i] = CoreCalc.kValue(point.dailyFoc(), point.speedKnots());
        }
        return values;
    }

    private static double contribution(double rate, long days) {
        if (!finite(rate) || days < 0L) {
            return Double.NaN;
        }
        return rate * days;
    }

    private static double clamp01(double value) {
        if (!finite(value)) {
            return 0.5;
        }
        return Math.max(0.0, Math.min(1.0, value));
    }

    private static boolean resetsAnything(MaintenanceEvent event) {
        return event.type().resetsHull() || event.type().resetsPropeller();
    }

    private static List<DailyPoint> sortedPoints(List<DailyPoint> points) {
        List<DailyPoint> ordered = new ArrayList<>(points.size());
        for (DailyPoint point : points) {
            ordered.add(Objects.requireNonNull(point, "point"));
        }
        ordered.sort(Comparator.comparing(DailyPoint::date));
        return ordered;
    }

    private static List<MaintenanceEvent> sortedEvents(List<MaintenanceEvent> events) {
        List<MaintenanceEvent> ordered = new ArrayList<>(events.size());
        for (MaintenanceEvent event : events) {
            ordered.add(Objects.requireNonNull(event, "event"));
        }
        ordered.sort(Comparator.comparingInt(MaintenanceEvent::dayIndex)
                .thenComparing(event -> event.type().ordinal()));
        return ordered;
    }

    private static double[] toArray(List<Double> values) {
        double[] result = new double[values.size()];
        for (int i = 0; i < values.size(); i++) {
            result[i] = values.get(i);
        }
        return result;
    }

    private static boolean finite(double value) {
        return Double.isFinite(value);
    }

    private static final class WindowStats {
        private final double[] beforeK;
        private final double[] afterK;
        private final double medianKBefore;
        private final double medianKAfter;

        private WindowStats(double[] beforeK, double[] afterK,
                double medianKBefore, double medianKAfter) {
            this.beforeK = beforeK;
            this.afterK = afterK;
            this.medianKBefore = medianKBefore;
            this.medianKAfter = medianKAfter;
        }
    }
}
