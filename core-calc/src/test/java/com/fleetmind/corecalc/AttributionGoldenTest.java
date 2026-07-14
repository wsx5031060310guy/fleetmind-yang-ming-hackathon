package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

public final class AttributionGoldenTest {
    private static final LocalDate START = LocalDate.parse("2025-01-01");

    public static void main(String[] args) {
        pureHullCases();
        purePropellerCases();
        mixedCases();
        uwiValidationCases();
        dryDockCases();
        insufficientDataCases();
        System.out.println("attribution golden checks passed: 6 groups");
    }

    private static void pureHullCases() {
        List<MaintenanceEvent> events = List.of(
                event(0, MaintenanceEvent.EventType.PP),
                event(20, MaintenanceEvent.EventType.UWC),
                event(40, MaintenanceEvent.EventType.UWC_PP));
        List<DailyPoint> points = new ArrayList<>();
        addLinear(points, 1, 19, 1.0, 0.001, 0);
        addLinear(points, 21, 39, 1.0, 0.0, 20);
        addLinear(points, 41, 60, 1.0, 0.001, 40);

        AttributionResult result = Attribution.attribute(points, events, 1.0);
        assertClose("pure hull share", 1.0, result.hullShare());
        assertClose("pure hull propeller share", 0.0, result.propellerShare());
        assertTrue("pure hull is model-based", !result.heuristic());

        EventImpact impact = Attribution.eventImpact(points, events.get(1), 10, 5);
        double expectedBefore = 1.0 + 0.001 * 14.5;
        assertClose("UWC delta k", expectedBefore - 1.0, impact.deltaK());
        assertClose("UWC recovery percent", (expectedBefore - 1.0) / expectedBefore * 100.0,
                impact.deltaPct());
        assertTrue("UWC expects improvement", impact.expectedImprovement());
        assertTrue("UWC event impact confident", !impact.lowConfidence());
        EventValidation validation = Attribution.validateEvents(
                points, List.of(events.get(1)), 10).get(0);
        assertEquals("UWC confirms expected improvement",
                EventValidation.Verdict.CONFIRMS_EXPECTED, validation.verdict());
        assertTrue("UWC threshold comes from non-zero MAD", validation.noiseThresholdPct() > 0.0);
    }

    private static void purePropellerCases() {
        List<MaintenanceEvent> events = List.of(
                event(0, MaintenanceEvent.EventType.UWC),
                event(20, MaintenanceEvent.EventType.PP),
                event(40, MaintenanceEvent.EventType.UWC_PP));
        List<DailyPoint> points = new ArrayList<>();
        addLinear(points, 1, 19, 1.0, 0.0004, 0);
        addLinear(points, 21, 39, 1.0, 0.0, 20);
        addLinear(points, 41, 60, 1.0, 0.0004, 40);

        AttributionResult result = Attribution.attribute(points, events, 1.0);
        assertClose("pure propeller hull share", 0.0, result.hullShare());
        assertClose("pure propeller share", 1.0, result.propellerShare());
        assertClose("pure propeller learned rate", 0.0004, result.propellerRatePerDay());
        assertTrue("pure propeller is model-based", !result.heuristic());

        EventImpact impact = Attribution.eventImpact(points, events.get(1), 10, 5);
        assertTrue("PP expects improvement", impact.expectedImprovement());
        assertTrue("PP measured improvement", impact.deltaPct() > 0.0);
    }

    private static void mixedCases() {
        List<MaintenanceEvent> events = List.of(
                event(0, MaintenanceEvent.EventType.PP),
                event(20, MaintenanceEvent.EventType.UWC),
                event(40, MaintenanceEvent.EventType.UWC_PP));
        List<DailyPoint> points = new ArrayList<>();
        addLinear(points, 1, 19, 1.0, 0.0007, 0);
        addLinear(points, 21, 39, 1.0, 0.0003, 20);
        for (int day = 41; day <= 60; day++) {
            double elapsed = day - 40.0;
            points.add(point(day, 1.0 + 0.0007 * elapsed + 0.0003 * elapsed));
        }

        AttributionResult result = Attribution.attribute(points, events, 1.0);
        assertWithin("mixed hull share", 0.70, result.hullShare(), 0.10);
        assertWithin("mixed propeller share", 0.30, result.propellerShare(), 0.10);
        assertClose("mixed shares sum", 1.0, result.hullShare() + result.propellerShare());
    }

    private static void uwiValidationCases() {
        MaintenanceEvent uwi = event(10, MaintenanceEvent.EventType.UWI);
        List<DailyPoint> flat = new ArrayList<>();
        addLinear(flat, 1, 9, 1.0, 0.0, 0);
        addLinear(flat, 11, 19, 1.0, 0.0, 10);
        EventValidation flatValidation = Attribution.validateEvents(flat, List.of(uwi), 9).get(0);
        assertEquals("flat UWI verdict", EventValidation.Verdict.NO_CHANGE_AS_EXPECTED,
                flatValidation.verdict());
        assertTrue("UWI expects no improvement", !flatValidation.expectedImprovement());
        assertClose("flat UWI noise threshold", 0.0, flatValidation.noiseThresholdPct());

        List<DailyPoint> artificialImprovement = new ArrayList<>();
        addLinear(artificialImprovement, 1, 9, 1.0, 0.0, 0);
        addLinear(artificialImprovement, 11, 19, 0.9, 0.0, 10);
        EventValidation unexpected = Attribution.validateEvents(
                artificialImprovement, List.of(uwi), 9).get(0);
        assertEquals("improved UWI verdict", EventValidation.Verdict.UNEXPECTED,
                unexpected.verdict());

        assertTrue("PP resets propeller", MaintenanceEvent.EventType.PP.resetsPropeller());
        assertTrue("PP does not reset hull", !MaintenanceEvent.EventType.PP.resetsHull());
        assertTrue("UWI+PP resets propeller only",
                MaintenanceEvent.EventType.UWI_PP.resetsPropeller()
                        && !MaintenanceEvent.EventType.UWI_PP.resetsHull());
        assertTrue("UWC+PP resets both", MaintenanceEvent.EventType.UWC_PP.resetsHull()
                && MaintenanceEvent.EventType.UWC_PP.resetsPropeller());
        assertTrue("UWI resets nothing", !MaintenanceEvent.EventType.UWI.resetsHull()
                && !MaintenanceEvent.EventType.UWI.resetsPropeller());
    }

    private static void dryDockCases() {
        List<MaintenanceEvent> events = List.of(
                event(0, MaintenanceEvent.EventType.PP),
                event(20, MaintenanceEvent.EventType.UWC),
                event(40, MaintenanceEvent.EventType.DD));
        List<DailyPoint> points = new ArrayList<>();
        addLinear(points, 1, 19, 1.1, 0.0007, 0);
        addLinear(points, 21, 39, 1.0, 0.0003, 20);
        addLinear(points, 41, 55, 0.8, 0.0, 40);
        addLinear(points, 56, 70, 0.8, 0.001, 55);

        AttributionResult result = Attribution.attribute(points, events, 1.25);
        assertClose("DD re-anchors kClean", 0.8, result.kClean());
        assertEquals("DD resets hull clock", 30L, result.daysSinceHullReset());
        assertEquals("DD resets propeller clock", 30L, result.daysSincePropellerReset());
        assertTrue("DD resets both", MaintenanceEvent.EventType.DD.resetsHull()
                && MaintenanceEvent.EventType.DD.resetsPropeller());
    }

    private static void insufficientDataCases() {
        List<DailyPoint> points = List.of(point(0, 1.0), point(1, 1.01));
        AttributionResult result = Attribution.attribute(points, List.of(), Double.NaN);
        assertTrue("insufficient data low confidence", result.lowConfidence());
        assertTrue("insufficient data heuristic", result.heuristic());
        assertClose("fallback hull share", 0.5, result.hullShare());
        assertClose("fallback propeller share", 0.5, result.propellerShare());
        assertTrue("hull share finite", Double.isFinite(result.hullShare()));
        assertTrue("propeller share finite", Double.isFinite(result.propellerShare()));

        EventImpact impact = Attribution.eventImpact(points,
                event(50, MaintenanceEvent.EventType.UWI), 5, 3);
        assertTrue("empty event window low confidence", impact.lowConfidence());
        assertNaN("empty event delta", impact.deltaPct());
    }

    private static void addLinear(List<DailyPoint> points, int fromDay, int toDay,
            double intercept, double slope, int originDay) {
        for (int day = fromDay; day <= toDay; day++) {
            points.add(point(day, intercept + slope * (day - originDay)));
        }
    }

    private static DailyPoint point(int day, double k) {
        double speed = 10.0;
        return new DailyPoint(START.plusDays(day), k * Math.pow(speed, 3.0), speed,
                EnumSet.noneOf(QualityFlag.class));
    }

    private static MaintenanceEvent event(int day, MaintenanceEvent.EventType type) {
        return MaintenanceEvent.fromDate("YM-TEST", START.plusDays(day), type);
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

    private static void assertWithin(String name, double expected, double actual, double tolerance) {
        if (!Double.isFinite(expected) || !Double.isFinite(actual)) {
            throw new AssertionError(name + ": expected finite " + expected + " but got " + actual);
        }
        if (Math.abs(expected - actual) > tolerance) {
            throw new AssertionError(name + ": expected " + expected + " +/- " + tolerance
                    + " but got " + actual);
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
