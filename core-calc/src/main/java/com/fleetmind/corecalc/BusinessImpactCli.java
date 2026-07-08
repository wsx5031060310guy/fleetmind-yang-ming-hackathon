package com.fleetmind.corecalc;

import java.util.Locale;

public final class BusinessImpactCli {
    private BusinessImpactCli() {
    }

    public static void main(String[] args) {
        Options options = Options.parse(args);
        BusinessImpactResult result = BusinessImpact.estimate(
                options.baselineDailyFoc,
                options.observedDailyFoc,
                options.fuelPriceUsdPerMt,
                options.cleaningCostUsd,
                options.carbonPriceUsdPerTon,
                options.euEtsCoverageRate);

        System.out.println("metric,value");
        write("extra_fuel_mt_per_day", result.extraFuelMtPerDay());
        write("daily_fuel_cost_usd", result.dailyFuelCostUsd());
        write("annualized_fuel_cost_usd", result.annualizedFuelCostUsd());
        write("daily_co2_metric_tons", result.dailyCo2MetricTons());
        write("annualized_co2_metric_tons", result.annualizedCo2MetricTons());
        write("daily_eu_ets_cost_usd", result.dailyEuEtsCostUsd());
        write("annualized_eu_ets_cost_usd", result.annualizedEuEtsCostUsd());
        write("daily_avoidable_cost_usd", result.dailyAvoidableCostUsd());
        write("payback_days", result.paybackDays());
    }

    private static void write(String metric, double value) {
        String text = Double.isInfinite(value) ? "Infinity" : String.format(Locale.ROOT, "%.6f", value);
        System.out.println(metric + "," + text);
    }

    private static final class Options {
        private double baselineDailyFoc = Double.NaN;
        private double observedDailyFoc = Double.NaN;
        private double fuelPriceUsdPerMt = 650.0;
        private double cleaningCostUsd = 40000.0;
        private double carbonPriceUsdPerTon = 90.0;
        private double euEtsCoverageRate = 0.5;

        private static Options parse(String[] args) {
            Options options = new Options();
            for (int i = 0; i < args.length; i++) {
                String key = args[i];
                if ("--help".equals(key) || "-h".equals(key)) {
                    usage();
                    System.exit(0);
                }
                if (i + 1 >= args.length) {
                    throw new IllegalArgumentException("missing value for " + key);
                }
                double value = Double.parseDouble(args[++i]);
                if ("--baseline-daily-foc".equals(key)) {
                    options.baselineDailyFoc = value;
                } else if ("--observed-daily-foc".equals(key)) {
                    options.observedDailyFoc = value;
                } else if ("--fuel-price-usd-per-mt".equals(key)) {
                    options.fuelPriceUsdPerMt = value;
                } else if ("--cleaning-cost-usd".equals(key)) {
                    options.cleaningCostUsd = value;
                } else if ("--carbon-price-usd-per-ton".equals(key)) {
                    options.carbonPriceUsdPerTon = value;
                } else if ("--eu-ets-coverage-rate".equals(key)) {
                    options.euEtsCoverageRate = value;
                } else {
                    throw new IllegalArgumentException("unknown argument: " + key);
                }
            }
            if (!Double.isFinite(options.baselineDailyFoc) || !Double.isFinite(options.observedDailyFoc)) {
                usage();
                throw new IllegalArgumentException("--baseline-daily-foc and --observed-daily-foc are required");
            }
            return options;
        }

        private static void usage() {
            System.err.println("Usage: business-impact --baseline-daily-foc 58 --observed-daily-foc 61");
        }
    }
}
