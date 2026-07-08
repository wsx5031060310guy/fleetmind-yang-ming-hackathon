package com.fleetmind.corecalc;

public final class BusinessImpactResult {
    private final double extraFuelMtPerDay;
    private final double dailyFuelCostUsd;
    private final double annualizedFuelCostUsd;
    private final double dailyCo2MetricTons;
    private final double annualizedCo2MetricTons;
    private final double dailyEuEtsCostUsd;
    private final double annualizedEuEtsCostUsd;
    private final double dailyAvoidableCostUsd;
    private final double paybackDays;

    public BusinessImpactResult(
            double extraFuelMtPerDay,
            double dailyFuelCostUsd,
            double annualizedFuelCostUsd,
            double dailyCo2MetricTons,
            double annualizedCo2MetricTons,
            double dailyEuEtsCostUsd,
            double annualizedEuEtsCostUsd,
            double dailyAvoidableCostUsd,
            double paybackDays) {
        this.extraFuelMtPerDay = extraFuelMtPerDay;
        this.dailyFuelCostUsd = dailyFuelCostUsd;
        this.annualizedFuelCostUsd = annualizedFuelCostUsd;
        this.dailyCo2MetricTons = dailyCo2MetricTons;
        this.annualizedCo2MetricTons = annualizedCo2MetricTons;
        this.dailyEuEtsCostUsd = dailyEuEtsCostUsd;
        this.annualizedEuEtsCostUsd = annualizedEuEtsCostUsd;
        this.dailyAvoidableCostUsd = dailyAvoidableCostUsd;
        this.paybackDays = paybackDays;
    }

    public double extraFuelMtPerDay() {
        return extraFuelMtPerDay;
    }

    public double dailyFuelCostUsd() {
        return dailyFuelCostUsd;
    }

    public double annualizedFuelCostUsd() {
        return annualizedFuelCostUsd;
    }

    public double dailyCo2MetricTons() {
        return dailyCo2MetricTons;
    }

    public double annualizedCo2MetricTons() {
        return annualizedCo2MetricTons;
    }

    public double dailyEuEtsCostUsd() {
        return dailyEuEtsCostUsd;
    }

    public double annualizedEuEtsCostUsd() {
        return annualizedEuEtsCostUsd;
    }

    public double dailyAvoidableCostUsd() {
        return dailyAvoidableCostUsd;
    }

    public double paybackDays() {
        return paybackDays;
    }
}
