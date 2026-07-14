package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public final class DecisionSupportGoldenTest {
    private DecisionSupportGoldenTest() {
    }

    public static void main(String[] args) {
        upwardCrossingForecast();
        actAboveThreshold();
        cleaningDecayMapping();
        sparseSeriesIsLowConfidence();
        flatSeriesHasNoCrossing();
        System.out.println("DecisionSupportGoldenTest: PASS");
    }

    private static void upwardCrossingForecast() {
        List<DecisionSupport.SeriesPoint> points = new ArrayList<>();
        LocalDate start = LocalDate.of(2026, 1, 1);
        for (int i = 0; i < 8; i++) {
            double speedLoss = 4.0 + i;
            double fuelPenalty = (Math.pow(1.0 / (1.0 - speedLoss / 100.0), 3.0) - 1.0)
                    * 100.0;
            points.add(new DecisionSupport.SeriesPoint(start.plusDays(i), fuelPenalty, true));
        }
        DecisionSupport.Forecast forecast = DecisionSupport.forecastDaysToThreshold(
                points, 12.0, 3.0);
        assertEquals("crossing days", 1, forecast.daysToThreshold());
        assertClose("projected crossing", 12.0, forecast.projectedCrossValuePct());
        assertTrue("dense series confident", !forecast.lowConfidence());
    }

    private static void actAboveThreshold() {
        DecisionSupport.Recommendation recommendation = DecisionSupport.recommend(
                10.5, 10.0, 0, 30, 82.0, "HIGH");
        assertEquals("ACT status", DecisionSupport.Status.ACT, recommendation.status());
        assertEquals("cleaning action", DecisionSupport.Action.RECOMMEND_CLEANING,
                recommendation.action());
        assertTrue("UWILD remains first step", recommendation.rationale().contains("先安排 UWILD"));
    }

    private static void cleaningDecayMapping() {
        assertEquals("zero fresh", DecisionSupport.CleaningEffectiveness.FRESH,
                DecisionSupport.cleaningEffectiveness(0));
        assertEquals("two diminishing", DecisionSupport.CleaningEffectiveness.DIMINISHING,
                DecisionSupport.cleaningEffectiveness(2));
        assertEquals("three diminishing", DecisionSupport.CleaningEffectiveness.DIMINISHING,
                DecisionSupport.cleaningEffectiveness(3));
        assertEquals("four depleted", DecisionSupport.CleaningEffectiveness.DEPLETED,
                DecisionSupport.cleaningEffectiveness(4));
    }

    private static void sparseSeriesIsLowConfidence() {
        List<DecisionSupport.SeriesPoint> sparse = List.of(
                new DecisionSupport.SeriesPoint(LocalDate.of(2026, 1, 1), 10.0, true),
                new DecisionSupport.SeriesPoint(LocalDate.of(2026, 1, 8), 12.0, true));
        DecisionSupport.Forecast forecast = DecisionSupport.forecastDaysToThreshold(
                sparse, 10.0, 3.0);
        assertTrue("sparse low confidence", forecast.lowConfidence());
    }

    private static void flatSeriesHasNoCrossing() {
        List<DecisionSupport.SeriesPoint> flat = List.of(
                new DecisionSupport.SeriesPoint(LocalDate.of(2026, 1, 1), 5.0, true),
                new DecisionSupport.SeriesPoint(LocalDate.of(2026, 1, 8), 5.0, true),
                new DecisionSupport.SeriesPoint(LocalDate.of(2026, 1, 15), 5.0, true));
        DecisionSupport.Forecast forecast = DecisionSupport.forecastDaysToThreshold(
                flat, 10.0, 3.0);
        assertEquals("flat no crossing", null, forecast.daysToThreshold());
    }

    private static void assertClose(String label, double expected, Double actual) {
        if (actual == null || Math.abs(expected - actual) > 1.0e-8) {
            throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        }
    }

    private static void assertTrue(String label, boolean condition) {
        if (!condition) {
            throw new AssertionError(label);
        }
    }

    private static void assertEquals(String label, Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        }
    }
}
