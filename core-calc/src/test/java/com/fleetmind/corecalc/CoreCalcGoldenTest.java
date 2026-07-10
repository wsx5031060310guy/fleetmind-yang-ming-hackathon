package com.fleetmind.corecalc;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;

public final class CoreCalcGoldenTest {
    public static void main(String[] args) throws Exception {
        vlsfoConversions();
        dailyFocCases();
        qualityFlagCases();
        speedLossCases();
        businessImpactCases();
        dailyMetricKeepsFlaggedRows();
        exporterCases();
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
        BusinessImpactResult result = BusinessImpact.estimate(58.0, 61.0, 650.0, 40000.0, 90.0, 0.5);
        assertClose("extra fuel per day", 3.0, result.extraFuelMtPerDay());
        assertClose("daily fuel cost", 1950.0, result.dailyFuelCostUsd());
        assertClose("annual fuel cost", 711750.0, result.annualizedFuelCostUsd());
        assertClose("daily CO2", 9.342, result.dailyCo2MetricTons());
        assertClose("annual CO2", 3409.83, result.annualizedCo2MetricTons());
        assertClose("daily ETS cost", 420.39, result.dailyEuEtsCostUsd());
        assertClose("payback days with ETS", 16.87486026, result.paybackDays());
        assertTrue("no penalty gives infinite payback",
                Double.isInfinite(BusinessImpact.estimate(61.0, 58.0, 650.0, 40000.0, 90.0, 0.5).paybackDays()));
    }

    private static void dailyMetricKeepsFlaggedRows() {
        NoonReportDaily report = new NoonReportDaily("YM-001", LocalDate.parse("2025-01-01"), 6, 20.0, 20.0);
        DailyMetric metric = CoreCalc.dailyMetric(report);
        assertClose("daily metric still computes FOC", 24.0, metric.dailyFoc());
        assertEquals("flags do not drop row", EnumSet.of(QualityFlag.HIGH_WIND, QualityFlag.INSUFFICIENT_FULL_SPEED_HOURS),
                metric.qualityFlags());
    }

    private static void assertClose(String name, double expected, double actual) {
        if (!Double.isFinite(expected) || !Double.isFinite(actual)
                || Math.abs(expected - actual) > 0.000001) {
            throw new AssertionError(name + ": expected " + expected + " but got " + actual);
        }
    }

    private static void exporterCases() throws Exception {
        final Path directory = Path.of("core-calc/build/exporter-golden");
        Files.createDirectories(directory);

        final String header = "vessel_id,date,ME_FULLSPEED_CONSUMP_VLSFO,HOURS_FULL_SPEED,WIND_SCALE,note\n";
        final Path dirtyInput = directory.resolve("dirty.csv");
        Files.writeString(dirtyInput, "\uFEFF" + header
                + "0012,2025-01-01,22,22,4,ok\n"
                + "V2,2025/01/02,N/A,22,4.0,bad\n"
                + "V3,2025-01-03,２２,22,4,full width\n"
                + "V4,2025-01-04,,22,4,blank\n",
                StandardCharsets.UTF_8);
        final Path dirtyOutput = directory.resolve("dirty-output.csv");
        runExporter(dirtyInput, dirtyOutput);
        final List<List<String>> dirty = readCsv(dirtyOutput);
        assertEquals("BOM header and dirty row count", 5, dirty.size());
        assertEquals("leading-zero vessel id", "0012", dirty.get(1).get(0));
        assertEquals("valid FOC", "24.000000", dirty.get(1).get(2));
        assertTrue("bad date flagged", dirty.get(2).get(3).contains("PARSE_ERROR"));
        assertEquals("parse error FOC is blank", "", dirty.get(2).get(2));
        assertTrue("bad fuel flagged", dirty.get(2).get(3).contains("INVALID_FUEL_CONSUMP"));
        assertTrue("decimal wind accepted", !dirty.get(2).get(3).contains("MISSING_WIND_SCALE"));
        assertEquals("full-width digits parsed", "24.000000", dirty.get(3).get(2));
        assertTrue("blank FOC explained", !dirty.get(4).get(3).isEmpty());

        final Path newlineInput = directory.resolve("newline.csv");
        Files.writeString(newlineInput, header + "V5,2025-01-05,22,22,4,\"first\nsecond\"\n",
                StandardCharsets.UTF_8);
        final Path newlineOutput = directory.resolve("newline-output.csv");
        runExporter(newlineInput, newlineOutput);
        assertEquals("embedded newline is one record", 2, readCsv(newlineOutput).size());

        final Path duplicateInput = directory.resolve("duplicate.csv");
        Files.writeString(duplicateInput,
                "vessel_id,date,date,ME_FULLSPEED_CONSUMP_VLSFO,HOURS_FULL_SPEED\nV1,x,x,1,1\n",
                StandardCharsets.UTF_8);
        final Path duplicateOutput = directory.resolve("duplicate-output.csv");
        Files.deleteIfExists(duplicateOutput);
        assertThrows("duplicate header fails", () -> runExporter(duplicateInput, duplicateOutput));
        assertTrue("duplicate header creates no final output", !Files.exists(duplicateOutput));

        final Path profileOutput = directory.resolve("profile-output.csv");
        FuelConsumpExportCli.main(new String[] {
                "--input", dirtyInput.toString(), "--output", profileOutput.toString(),
                "--scale", "2", "--rounding-mode", "HALF_UP", "--line-ending", "crlf"
        });
        final byte[] profileBytes = Files.readAllBytes(profileOutput);
        final String profile = new String(profileBytes, StandardCharsets.UTF_8);
        assertTrue("scale exact output", profile.contains("0012,2025-01-01,24.00,"));
        assertTrue("CRLF ending", profile.endsWith("\r\n"));
        assertTrue("no bare LF", !profile.replace("\r\n", "").contains("\n"));
    }

    private static void runExporter(Path input, Path output) throws IOException {
        FuelConsumpExportCli.main(new String[] {
                "--input", input.toString(), "--output", output.toString()
        });
    }

    private static List<List<String>> readCsv(Path path) throws IOException {
        final java.util.ArrayList<List<String>> rows = new java.util.ArrayList<List<String>>();
        try (java.io.Reader input = Files.newBufferedReader(path, StandardCharsets.UTF_8);
                Csv.RecordReader reader = Csv.recordReader(input)) {
            List<String> row;
            while ((row = reader.nextRecord()) != null) {
                rows.add(row);
            }
        }
        return rows;
    }

    private static void assertThrows(String name, ThrowingRunnable runnable) {
        try {
            runnable.run();
        } catch (Exception expected) {
            return;
        }
        throw new AssertionError(name);
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
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
