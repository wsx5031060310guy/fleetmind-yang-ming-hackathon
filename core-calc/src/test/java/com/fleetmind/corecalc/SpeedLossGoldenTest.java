package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

public final class SpeedLossGoldenTest {
    private static final LocalDate START = LocalDate.parse("2025-01-01");

    public static void main(String[] args) {
        medianCases();
        referenceWindowCases();
        sameSpeedBandCases();
        rollingMedianCases();
        theilSenCases();
        speedLossSeriesCases();
        beforeAfterCases();
        fuelPenaltyCases();
        System.out.println("speed-loss golden checks passed: 8 groups");
    }

    private static void medianCases() {
        assertClose("odd median", 2.0, SpeedLoss.median(new double[] {3.0, 1.0, 2.0}));
        assertClose("even median", 2.5, SpeedLoss.median(new double[] {4.0, 1.0, 3.0, 2.0}));
        assertClose("single median", 7.0, SpeedLoss.median(new double[] {7.0}));
        assertNaN("empty median", SpeedLoss.median(new double[0]));
        assertClose("unsorted median", 5.0, SpeedLoss.median(new double[] {9.0, 5.0, 1.0}));
        assertClose("duplicate median", 2.0, SpeedLoss.median(new double[] {2.0, 2.0, 8.0, 1.0}));
    }

    private static void referenceWindowCases() {
        ReferenceWindow exactlyMin = SpeedLoss.referenceWindow(points(10, 0.008, 10.0), 10, 15, 60);
        assertEquals("exactly min count", 10, exactlyMin.points().size());
        assertTrue("exactly min confident", !exactlyMin.lowConfidence());
        assertClose("reference k", 0.008, exactlyMin.kRef());
        assertClose("reference speed", 10.0, exactlyMin.refSpeedMedian());

        ReferenceWindow tooFew = SpeedLoss.referenceWindow(points(9, 0.008, 10.0), 10, 15, 60);
        assertTrue("fewer than min low confidence", tooFew.lowConfidence());

        List<DailyPoint> sparse = new ArrayList<>();
        for (int i = 0; i < 15; i++) {
            sparse.add(point(START.plusDays(i * 5L), 0.008, 10.0));
        }
        ReferenceWindow capped = SpeedLoss.referenceWindow(sparse, 10, 15, 20);
        assertEquals("calendar cap before max", 4, capped.points().size());

        List<DailyPoint> none = List.of(flaggedPoint(START, 0.008, 10.0));
        ReferenceWindow empty = SpeedLoss.referenceWindow(none, 10, 15, 60);
        assertEquals("zero qualified count", 0, empty.points().size());
        assertNaN("zero qualified k", empty.kRef());
        assertNaN("zero qualified speed", empty.refSpeedMedian());
        assertTrue("zero qualified low confidence", empty.lowConfidence());

        List<DailyPoint> interleaved = new ArrayList<>();
        interleaved.add(flaggedPoint(START.minusDays(20), 0.008, 10.0));
        interleaved.add(point(START, 0.008, 10.0));
        interleaved.add(flaggedPoint(START.plusDays(5), 0.008, 10.0));
        interleaved.add(point(START.plusDays(10), 0.008, 10.0));
        interleaved.add(flaggedPoint(START.plusDays(19), 0.008, 10.0));
        interleaved.add(point(START.plusDays(20), 0.008, 10.0));
        ReferenceWindow skipped = SpeedLoss.referenceWindow(interleaved, 2, 5, 20);
        assertEquals("flagged skipped and cap clock runs", 2, skipped.points().size());
        assertEquals("second qualified retained", START.plusDays(10), skipped.points().get(1).date());
    }

    private static void sameSpeedBandCases() {
        List<DailyPoint> points = List.of(
                point(START, 0.008, 9.0),
                point(START.plusDays(1), 0.008, 10.0),
                point(START.plusDays(2), 0.008, 11.0),
                point(START.plusDays(3), 0.008, 11.0001));
        List<DailyPoint> selected = SpeedLoss.sameSpeedBand(points, 10.0, 1.0);
        assertEquals("speed band inclusive boundaries", 3, selected.size());
        assertEquals("NaN ref gives empty", 0,
                SpeedLoss.sameSpeedBand(points, Double.NaN, 1.0).size());
    }

    private static void rollingMedianCases() {
        assertArrayClose("window larger than series", new double[] {3.0, 3.0, 3.0},
                SpeedLoss.rollingMedian(new double[] {5.0, 1.0, 3.0}, 9));
        assertArrayClose("NaN holes", new double[] {1.0, 2.0, 3.0, 4.0, 5.0},
                SpeedLoss.rollingMedian(new double[] {1.0, Double.NaN, 3.0, Double.NaN, 5.0}, 3));
        double[] allNan = SpeedLoss.rollingMedian(new double[] {Double.NaN}, 5);
        assertNaN("all NaN window", allNan[0]);
        assertEquals("empty rolling output", 0, SpeedLoss.rollingMedian(new double[0], 5).length);
    }

    private static void theilSenCases() {
        List<LocalDate> dates = new ArrayList<>();
        double[] linear = new double[5];
        for (int i = 0; i < linear.length; i++) {
            dates.add(START.plusDays(i));
            linear[i] = 0.01 + i * 0.001;
        }
        assertClose("perfect linear slope", 0.001, SpeedLoss.theilSenSlopePerDay(dates, linear));

        assertClose("duplicate dates skipped", 0.001, SpeedLoss.theilSenSlopePerDay(
                List.of(START, START, START.plusDays(2)), new double[] {0.010, 0.010, 0.012}));
        assertNaN("single point slope", SpeedLoss.theilSenSlopePerDay(
                List.of(START), new double[] {0.010}));

        List<LocalDate> robustDates = new ArrayList<>();
        double[] robust = new double[10];
        for (int i = 0; i < robust.length; i++) {
            robustDates.add(START.plusDays(i));
            robust[i] = 0.010 + i * 0.001;
        }
        robust[9] = 1000.0;
        assertClose("Theil-Sen robust to one wild outlier", 0.001,
                SpeedLoss.theilSenSlopePerDay(robustDates, robust));
    }

    private static void speedLossSeriesCases() {
        List<DailyPoint> points = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            double k = i < 10 ? 0.008 : 0.016;
            points.add(i == 15
                    ? flaggedPoint(START.plusDays(i), k, 10.0)
                    : point(START.plusDays(i), k, 10.0));
        }
        ReferenceWindow ref = SpeedLoss.referenceWindow(points, 10, 10, 60);
        SpeedLossResult result = SpeedLoss.speedLossSeries(points, ref, 3.0);
        double expected = (1.0 - Math.pow(0.5, 1.0 / 3.0)) * 100.0;
        assertEquals("all dates retained", 20, result.dates().size());
        assertClose("doubled k speed loss", expected, result.speedLossPct()[10]);
        assertClose("doubled k speed loss second half", expected, result.speedLossPct()[19]);
        assertNaN("flagged day k NaN", result.kValues()[15]);
        assertNaN("flagged day loss NaN", result.speedLossPct()[15]);
        assertTrue("slope computed", Double.isFinite(result.theilSenSlopePerDay()));
    }

    private static void beforeAfterCases() {
        LocalDate event = START.plusDays(10);
        List<DailyPoint> cleaning = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            cleaning.add(point(event.minusDays(10 - i), 0.008, 10.0));
        }
        for (int i = 1; i <= 10; i++) {
            cleaning.add(point(event.plusDays(i), 0.007, 10.0));
        }
        BeforeAfterResult recovered = SpeedLoss.beforeAfter(cleaning, event, 30, 5);
        assertClose("before median k", 0.008, recovered.medianKBefore());
        assertClose("after median k", 0.007, recovered.medianKAfter());
        assertClose("cleaning recovery", 12.5, recovered.recoveryPct());
        assertTrue("cleaning comparison confident", !recovered.lowConfidence());

        BeforeAfterResult insufficient = SpeedLoss.beforeAfter(
                List.of(point(event.minusDays(1), 0.008, 10.0), point(event.plusDays(1), 0.007, 10.0)),
                event, 30, 5);
        assertTrue("insufficient sides low confidence", insufficient.lowConfidence());

        BeforeAfterResult edge = SpeedLoss.beforeAfter(cleaning, cleaning.get(0).date(), 30, 5);
        assertNaN("edge has no before median", edge.medianKBefore());
        assertNaN("edge recovery NaN", edge.recoveryPct());
        assertTrue("edge low confidence", edge.lowConfidence());
    }

    private static void fuelPenaltyCases() {
        assertClose("ten percent fuel penalty", 10.0, SpeedLoss.fuelPenaltyPct(0.011, 0.010));
        assertNaN("invalid reference fuel penalty", SpeedLoss.fuelPenaltyPct(0.011, 0.0));
    }

    private static List<DailyPoint> points(int count, double k, double speed) {
        List<DailyPoint> points = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            points.add(point(START.plusDays(i), k, speed));
        }
        return points;
    }

    private static DailyPoint point(LocalDate date, double k, double speed) {
        return new DailyPoint(date, k * Math.pow(speed, 3.0), speed,
                EnumSet.noneOf(QualityFlag.class));
    }

    private static DailyPoint flaggedPoint(LocalDate date, double k, double speed) {
        return new DailyPoint(date, k * Math.pow(speed, 3.0), speed,
                EnumSet.of(QualityFlag.HIGH_WIND));
    }

    private static void assertArrayClose(String name, double[] expected, double[] actual) {
        assertEquals(name + " length", expected.length, actual.length);
        for (int i = 0; i < expected.length; i++) {
            assertClose(name + "[" + i + "]", expected[i], actual[i]);
        }
    }

    private static void assertClose(String name, double expected, double actual) {
        if (!Double.isFinite(expected) || !Double.isFinite(actual)) {
            throw new AssertionError(name + ": expected finite " + expected + " but got " + actual);
        }
        double tolerance = 0.000001 * Math.max(1.0, Math.abs(expected));
        if (Math.abs(expected - actual) > tolerance) {
            throw new AssertionError(name + ": expected " + expected + " but got " + actual);
        }
    }

    private static void assertNaN(String name, double actual) {
        if (!Double.isNaN(actual)) {
            throw new AssertionError(name + ": expected NaN but got " + actual);
        }
    }

    private static void assertEquals(String name, Object expected, Object actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError(name + ": expected " + expected + " but got " + actual);
        }
    }

    private static void assertTrue(String name, boolean condition) {
        if (!condition) {
            throw new AssertionError(name);
        }
    }
}
