package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.EnumSet;

public final class CoreCalcGoldenTest {
    public static void main(String[] args) {
        vlsfoConversions();
        dailyFocCases();
        qualityFlagCases();
        speedLossCases();
        businessImpactCases();
        dailyMetricKeepsFlaggedRows();
        System.out.println("core-calc golden checks passed");
    }

    private static void vlsfoConversions() {
        assertClose("VLSFO unchanged", 10.0, CoreCalc.vlsfoEquivalent(Arrays.asList(new FuelMass(FuelType.VLSFO, 10.0))));
        assertClose("HFO unchanged", 7.5, CoreCalc.vlsfoEquivalent(Arrays.asList(new FuelMass(FuelType.HFO, 7.5))));
        assertClose("MGO converts by LCV", 10.62189055, CoreCalc.vlsfoEquivalent(Arrays.asList(new FuelMass(FuelType.MGO, 10.0))));
        assertClose("ULSFO converts by LCV", 10.24875621, CoreCalc.vlsfoEquivalent(Arrays.asList(new FuelMass(FuelType.ULSFO, 10.0))));
        assertClose("multi-fuel day sums", 22.98507463, CoreCalc.vlsfoEquivalent(Arrays.asList(
                new FuelMass(FuelType.MGO, 5.0),
                new FuelMass(FuelType.ULSFO, 7.0),
                new FuelMass(FuelType.VLSFO, 10.5))));
    }

    private static void dailyFocCases() {
        assertClose("24h full-speed day", 18.0, CoreCalc.dailyFoc(18.0, 24.0));
        assertClose("20h scaled to day", 24.0, CoreCalc.dailyFoc(20.0, 20.0));
        assertClose("22h boundary scaled", 24.0, CoreCalc.dailyFoc(22.0, 22.0));
        assertTrue("zero hours gives NaN", Double.isNaN(CoreCalc.dailyFoc(22.0, 0.0)));
    }

    private static void qualityFlagCases() {
        assertEquals("wind 4 and hours 22 pass", EnumSet.noneOf(QualityFlag.class), CoreCalc.qualityFlags(4, 22.0));
        assertEquals("wind 5 flagged", EnumSet.of(QualityFlag.HIGH_WIND), CoreCalc.qualityFlags(5, 22.0));
        assertEquals("21.9 hours flagged", EnumSet.of(QualityFlag.INSUFFICIENT_FULL_SPEED_HOURS), CoreCalc.qualityFlags(4, 21.9));
        assertEquals("zero hours invalid", EnumSet.of(QualityFlag.INVALID_FULL_SPEED_HOURS), CoreCalc.qualityFlags(4, 0.0));
        assertEquals("missing wind flagged", EnumSet.of(QualityFlag.MISSING_WIND_SCALE), CoreCalc.qualityFlags(null, 24.0));
    }

    private static void speedLossCases() {
        double kRef = 100.0;
        double kObserved = 115.7625;
        assertClose("cube-law speed loss", 4.76190476, CoreCalc.speedLossPct(kRef, kObserved, 3.0));
        assertClose("k value", 0.003, CoreCalc.kValue(24.0, 20.0));
    }

    private static void businessImpactCases() {
        BusinessImpactResult result = BusinessImpact.estimate(58.0, 61.0, 525.0, 40000.0, 80.0, 0.5);
        assertClose("extra fuel per day", 3.0, result.extraFuelMtPerDay());
        assertClose("daily fuel cost", 1575.0, result.dailyFuelCostUsd());
        assertClose("annual fuel cost", 574875.0, result.annualizedFuelCostUsd());
        assertClose("daily CO2", 9.342, result.dailyCo2MetricTons());
        assertClose("annual CO2", 3409.83, result.annualizedCo2MetricTons());
        assertClose("daily ETS cost", 373.68, result.dailyEuEtsCostUsd());
        assertClose("payback days with ETS", 20.52671552, result.paybackDays());
        assertTrue("no penalty gives infinite payback",
                Double.isInfinite(BusinessImpact.estimate(61.0, 58.0, 525.0, 40000.0, 80.0, 0.5).paybackDays()));
    }

    private static void dailyMetricKeepsFlaggedRows() {
        NoonReportDaily report = new NoonReportDaily("YM-001", LocalDate.parse("2025-01-01"), 6, 20.0, 20.0);
        DailyMetric metric = CoreCalc.dailyMetric(report);
        assertClose("daily metric still computes FOC", 24.0, metric.dailyFoc());
        assertEquals("flags do not drop row", EnumSet.of(QualityFlag.HIGH_WIND, QualityFlag.INSUFFICIENT_FULL_SPEED_HOURS),
                metric.qualityFlags());
    }

    private static void assertClose(String name, double expected, double actual) {
        if (Math.abs(expected - actual) > 0.000001) {
            throw new AssertionError(name + ": expected " + expected + " but got " + actual);
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
