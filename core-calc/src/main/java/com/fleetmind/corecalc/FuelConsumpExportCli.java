package com.fleetmind.corecalc;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

public final class FuelConsumpExportCli {
    private FuelConsumpExportCli() {
    }

    public static void main(String[] args) throws IOException {
        Options options = Options.parse(args);
        List<String> lines = Files.readAllLines(options.input, StandardCharsets.UTF_8);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("input CSV is empty");
        }

        List<String> headers = Csv.parseLine(lines.get(0));
        Map<String, Integer> indexes = indexHeaders(headers);
        require(indexes, options.vesselIdHeader);
        require(indexes, options.dateHeader);
        require(indexes, options.consumpHeader);
        require(indexes, options.hoursHeader);

        try (BufferedWriter writer = Files.newBufferedWriter(options.output, StandardCharsets.UTF_8)) {
            writer.write("vessel_id,date,FUEL_CONSUMP,quality_flags");
            writer.newLine();
            for (int i = 1; i < lines.size(); i++) {
                if (lines.get(i).trim().isEmpty()) {
                    continue;
                }
                List<String> row = Csv.parseLine(lines.get(i));
                NoonReportDaily report = new NoonReportDaily(
                        cell(row, indexes.get(options.vesselIdHeader)),
                        LocalDate.parse(cell(row, indexes.get(options.dateHeader))),
                        optionalInteger(row, indexes.get(options.windHeader)),
                        parseDouble(cell(row, indexes.get(options.consumpHeader))),
                        parseDouble(cell(row, indexes.get(options.hoursHeader))));
                DailyMetric metric = CoreCalc.dailyMetric(report);
                writer.write(Csv.escape(metric.vesselId()));
                writer.write(",");
                writer.write(Csv.escape(metric.date().toString()));
                writer.write(",");
                writer.write(Double.isNaN(metric.dailyFoc())
                        ? ""
                        : String.format(Locale.ROOT, "%.6f", metric.dailyFoc()));
                writer.write(",");
                writer.write(Csv.escape(joinFlags(metric.qualityFlags())));
                writer.newLine();
            }
        }
    }

    private static Map<String, Integer> indexHeaders(List<String> headers) {
        Map<String, Integer> indexes = new HashMap<String, Integer>();
        for (int i = 0; i < headers.size(); i++) {
            indexes.put(headers.get(i).trim(), i);
        }
        return indexes;
    }

    private static void require(Map<String, Integer> indexes, String header) {
        if (!indexes.containsKey(header)) {
            throw new IllegalArgumentException("missing required header: " + header);
        }
    }

    private static String cell(List<String> row, int index) {
        if (index < 0 || index >= row.size()) {
            return "";
        }
        return row.get(index).trim();
    }

    private static double parseDouble(String value) {
        if (value == null || value.trim().isEmpty()) {
            return Double.NaN;
        }
        return Double.parseDouble(value.trim());
    }

    private static Integer optionalInteger(List<String> row, Integer index) {
        if (index == null) {
            return null;
        }
        String value = cell(row, index);
        return value.isEmpty() ? null : Integer.valueOf(value);
    }

    private static String joinFlags(Set<QualityFlag> flags) {
        StringJoiner joiner = new StringJoiner("|");
        for (QualityFlag flag : flags) {
            joiner.add(flag.name());
        }
        return joiner.toString();
    }

    private static final class Options {
        private Path input;
        private Path output;
        private String vesselIdHeader = "vessel_id";
        private String dateHeader = "date";
        private String consumpHeader = "ME_FULLSPEED_CONSUMP_VLSFO";
        private String hoursHeader = "HOURS_FULL_SPEED";
        private String windHeader = "WIND_SCALE";

        private static Options parse(String[] args) {
            Options options = new Options();
            List<String> values = new ArrayList<String>();
            for (int i = 0; i < args.length; i++) {
                values.add(args[i]);
            }
            for (int i = 0; i < values.size(); i++) {
                String key = values.get(i);
                if ("--help".equals(key) || "-h".equals(key)) {
                    printUsage();
                    System.exit(0);
                }
                if (i + 1 >= values.size()) {
                    throw new IllegalArgumentException("missing value for " + key);
                }
                String value = values.get(++i);
                if ("--input".equals(key)) {
                    options.input = Path.of(value);
                } else if ("--output".equals(key)) {
                    options.output = Path.of(value);
                } else if ("--vessel-id-header".equals(key)) {
                    options.vesselIdHeader = value;
                } else if ("--date-header".equals(key)) {
                    options.dateHeader = value;
                } else if ("--consump-header".equals(key)) {
                    options.consumpHeader = value;
                } else if ("--hours-header".equals(key)) {
                    options.hoursHeader = value;
                } else if ("--wind-header".equals(key)) {
                    options.windHeader = value;
                } else {
                    throw new IllegalArgumentException("unknown argument: " + key);
                }
            }
            if (options.input == null || options.output == null) {
                printUsage();
                throw new IllegalArgumentException("--input and --output are required");
            }
            return options;
        }

        private static void printUsage() {
            System.err.println("Usage: export-fuel-consump --input noon.csv --output fuel-consump.csv");
        }
    }
}
