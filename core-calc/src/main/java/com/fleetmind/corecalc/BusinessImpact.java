package com.fleetmind.corecalc;

public final class BusinessImpact {
    public static final double CO2_TONS_PER_MT_FUEL = 3.114;

    private BusinessImpact() {
    }

    public static double extraFuelMtPerDay(double baselineDailyFoc, double observedDailyFoc) {
        if (!Double.isFinite(baselineDailyFoc) || !Double.isFinite(observedDailyFoc)) {
            return Double.NaN;
        }
        return Math.max(0.0, observedDailyFoc - baselineDailyFoc);
    }

    public static double dailyFuelCostUsd(double extraFuelMtPerDay, double fuelPriceUsdPerMt) {
        if (!Double.isFinite(extraFuelMtPerDay) || !Double.isFinite(fuelPriceUsdPerMt)
                || extraFuelMtPerDay < 0.0 || fuelPriceUsdPerMt < 0.0) {
            return Double.NaN;
        }
        return extraFuelMtPerDay * fuelPriceUsdPerMt;
    }

    public static double annualizedFuelCostUsd(double dailyFuelCostUsd) {
        if (!Double.isFinite(dailyFuelCostUsd) || dailyFuelCostUsd < 0.0) {
            return Double.NaN;
        }
        return dailyFuelCostUsd * 365.0;
    }

    public static double co2MetricTons(double fuelMt) {
        if (!Double.isFinite(fuelMt) || fuelMt < 0.0) {
            return Double.NaN;
        }
        return fuelMt * CO2_TONS_PER_MT_FUEL;
    }

    public static double euEtsCostUsd(double co2MetricTons, double carbonPriceUsdPerTon, double coverageRate) {
        if (!Double.isFinite(co2MetricTons) || !Double.isFinite(carbonPriceUsdPerTon)
                || !Double.isFinite(coverageRate) || co2MetricTons < 0.0
                || carbonPriceUsdPerTon < 0.0 || coverageRate < 0.0 || coverageRate > 1.0) {
            return Double.NaN;
        }
        return co2MetricTons * carbonPriceUsdPerTon * coverageRate;
    }

    public static double paybackDays(double cleaningCostUsd, double dailyAvoidableCostUsd) {
        if (!Double.isFinite(cleaningCostUsd) || cleaningCostUsd < 0.0) {
            return Double.NaN;
        }
        if (!Double.isFinite(dailyAvoidableCostUsd) || dailyAvoidableCostUsd <= 0.0) {
            return Double.POSITIVE_INFINITY;
        }
        return cleaningCostUsd / dailyAvoidableCostUsd;
    }

    public static BusinessImpactResult estimate(
            double baselineDailyFoc,
            double observedDailyFoc,
            double fuelPriceUsdPerMt,
            double cleaningCostUsd,
            double carbonPriceUsdPerTon,
            double euEtsCoverageRate) {
        double extraFuel = extraFuelMtPerDay(baselineDailyFoc, observedDailyFoc);
        double dailyFuelCost = dailyFuelCostUsd(extraFuel, fuelPriceUsdPerMt);
        double annualFuelCost = annualizedFuelCostUsd(dailyFuelCost);
        double dailyCo2 = co2MetricTons(extraFuel);
        double annualCo2 = co2MetricTons(extraFuel * 365.0);
        double dailyEts = euEtsCostUsd(dailyCo2, carbonPriceUsdPerTon, euEtsCoverageRate);
        double annualEts = annualizedFuelCostUsd(dailyEts);
        double dailyAvoidableCost = dailyFuelCost + dailyEts;
        double payback = paybackDays(cleaningCostUsd, dailyAvoidableCost);
        return new BusinessImpactResult(
                extraFuel,
                dailyFuelCost,
                annualFuelCost,
                dailyCo2,
                annualCo2,
                dailyEts,
                annualEts,
                dailyAvoidableCost,
                payback);
    }
}
