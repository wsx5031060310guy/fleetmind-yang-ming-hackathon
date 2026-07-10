package com.fleetmind.api;

import com.fleetmind.corecalc.BusinessImpactResult;

public record BusinessImpactDto(
        Double extraFuelMtPerDay,
        Double dailyFuelCostUsd,
        Double annualizedFuelCostUsd,
        Double dailyCo2MetricTons,
        Double annualizedCo2MetricTons,
        Double dailyEuEtsCostUsd,
        Double annualizedEuEtsCostUsd,
        Double dailyAvoidableCostUsd,
        Double paybackDays) {

    public static BusinessImpactDto from(BusinessImpactResult result) {
        return new BusinessImpactDto(
                finite(result.extraFuelMtPerDay()),
                finite(result.dailyFuelCostUsd()),
                finite(result.annualizedFuelCostUsd()),
                finite(result.dailyCo2MetricTons()),
                finite(result.annualizedCo2MetricTons()),
                finite(result.dailyEuEtsCostUsd()),
                finite(result.annualizedEuEtsCostUsd()),
                finite(result.dailyAvoidableCostUsd()),
                finite(result.paybackDays()));
    }

    private static Double finite(double value) {
        return Double.isFinite(value) ? value : null;
    }
}
