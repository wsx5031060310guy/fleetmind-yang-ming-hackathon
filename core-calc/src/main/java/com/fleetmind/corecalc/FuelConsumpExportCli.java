package com.fleetmind.corecalc;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

public final class FuelConsumpExportCli {
    private static final List<String> AVAILABLE_COLUMNS = List.of(
            "vessel_id", "date", "FUEL_CONSUMP", "quality_flags");

    private FuelConsumpExportCli() {
    }

    public static void main(String[] args) throws IOException {
        final Options options = Options.parse(args);
        try {
            export(options);
        } catch (CharacterCodingException exception) {
            System.err.println("failed to decode input using --charset " + options.charset.name());
            System.exit(2);
        }
    }

    private static void export(Options options) throws IOException {
        final Path parent = options.output.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        final Path temporary = Path.of(options.output.toString() + ".tmp");

        int exported = 0;
        int parseErrors = 0;
        int blankFoc = 0;
        int skippedUnqualified = 0;
        try (Reader input = new InputStreamReader(Files.newInputStream(options.input),
                options.charset.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT));
                Csv.RecordReader records = Csv.recordReader(input)) {
            final List<String> headerRecord = records.nextRecord();
            if (headerRecord == null) {
                throw new IllegalArgumentException("input CSV is empty");
            }
            final Map<String, Integer> indexes = indexHeaders(headerRecord);
            require(indexes, options.vesselIdHeader);
            require(indexes, options.dateHeader);
            require(indexes, options.consumpHeader);
            require(indexes, options.hoursHeader);

            Files.deleteIfExists(temporary);
            try (BufferedWriter writer = Files.newBufferedWriter(temporary, StandardCharsets.UTF_8)) {
                writeRecord(writer, options.outputColumns, options.lineEnding);
                List<String> row;
                int recordNumber = 1;
                while ((row = records.nextRecord()) != null) {
                    recordNumber++;
                    if (isEmptyRecord(row)) {
                        continue;
                    }
                    ExportRow output;
                    boolean caught = false;
                    try {
                        output = processRow(row, indexes, options);
                    } catch (RuntimeException exception) {
                        final String vesselId = rawCell(row, indexes.get(options.vesselIdHeader));
                        final String date = rawCell(row, indexes.get(options.dateHeader));
                        output = new ExportRow(vesselId, date, "", EnumSet.of(QualityFlag.PARSE_ERROR));
                        System.err.println("record " + recordNumber + ": " + reason(exception));
                        caught = true;
                    }
                    if (output.flags.contains(QualityFlag.PARSE_ERROR)) {
                        parseErrors++;
                        if (!caught) {
                            System.err.println("record " + recordNumber + ": date does not match --date-format or ISO");
                        }
                    }
                    if (output.foc.isEmpty()) {
                        blankFoc++;
                    }
                    if (options.qualifiedOnly && !output.flags.isEmpty()) {
                        skippedUnqualified++;
                        continue;
                    }
                    writeRecord(writer, output.values(options.outputColumns), options.lineEnding);
                    exported++;
                }
            }
            moveAtomically(temporary, options.output);
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(temporary);
            throw exception;
        }
        System.err.println(exported + " rows exported, " + parseErrors + " parse errors, " + blankFoc + " blank FOC"
                + (options.qualifiedOnly ? ", " + skippedUnqualified + " unqualified rows skipped (--qualified-only)" : ""));
    }

    private static ExportRow processRow(List<String> row, Map<String, Integer> indexes, Options options) {
        final String vesselId = rawCell(row, indexes.get(options.vesselIdHeader));
        final String rawDate = rawCell(row, indexes.get(options.dateHeader));
        final EnumSet<QualityFlag> flags = EnumSet.noneOf(QualityFlag.class);
        final String date = normalizeDate(rawDate, options.dateFormatter, flags);

        final String fuelCell = cell(row, indexes.get(options.consumpHeader));
        final double fuel;
        if (fuelCell.isEmpty()) {
            fuel = Double.NaN;
            flags.add(QualityFlag.MISSING_FUEL_CONSUMP);
        } else {
            fuel = numericOrNaN(fuelCell);
            if (!Double.isFinite(fuel) || fuel < 0.0) {
                flags.add(QualityFlag.INVALID_FUEL_CONSUMP);
            }
        }

        final double hours = numericOrNaN(cell(row, indexes.get(options.hoursHeader)));
        final Integer windScale = parseWindScale(row, indexes.get(options.windHeader), flags);
        flags.addAll(CoreCalc.qualityFlags(windScale, hours));

        final double dailyFoc = CoreCalc.dailyFoc(fuel, hours);
        final String foc;
        if (flags.contains(QualityFlag.PARSE_ERROR)) {
            foc = "";
        } else if (!Double.isFinite(dailyFoc)) {
            foc = "";
            flags.add(QualityFlag.NONFINITE_FOC);
        } else {
            foc = BigDecimal.valueOf(dailyFoc).setScale(options.scale, options.roundingMode).toPlainString();
        }
        return new ExportRow(vesselId, date, foc, flags);
    }

    private static String normalizeDate(String value, DateTimeFormatter configured,
            EnumSet<QualityFlag> flags) {
        try {
            return LocalDate.parse(value, configured).toString();
        } catch (DateTimeParseException configuredFailure) {
            try {
                return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE).toString();
            } catch (DateTimeParseException isoFailure) {
                flags.add(QualityFlag.PARSE_ERROR);
                return value;
            }
        }
    }

    private static Integer parseWindScale(List<String> row, Integer index, EnumSet<QualityFlag> flags) {
        if (index == null) {
            return null;
        }
        final String value = cell(row, index);
        if (value.isEmpty()) {
            return null;
        }
        final double parsed = numericOrNaN(value);
        if (!Double.isFinite(parsed)) {
            return null;
        }
        final int rounded = BigDecimal.valueOf(parsed).setScale(0, RoundingMode.HALF_UP).intValueExact();
        if (parsed != rounded) {
            flags.add(QualityFlag.NON_INTEGER_WIND_SCALE);
        }
        return rounded;
    }

    private static double numericOrNaN(String value) {
        final String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC)
                .replace(",", "")
                .trim();
        if (normalized.isEmpty()) {
            return Double.NaN;
        }
        try {
            return Double.parseDouble(normalized);
        } catch (NumberFormatException exception) {
            return Double.NaN;
        }
    }

    private static Map<String, Integer> indexHeaders(List<String> headers) {
        final Map<String, Integer> indexes = new HashMap<String, Integer>();
        for (int i = 0; i < headers.size(); i++) {
            final String name = normalizeHeader(headers.get(i), i == 0);
            final Integer previous = indexes.putIfAbsent(name, i);
            if (previous != null) {
                throw new IllegalArgumentException("duplicate header '" + name + "' at columns "
                        + (previous + 1) + " and " + (i + 1));
            }
        }
        return indexes;
    }

    private static String normalizeHeader(String value, boolean first) {
        String normalized = value.trim();
        if (first && normalized.startsWith("\uFEFF")) {
            normalized = normalized.substring(1).trim();
        }
        return normalized;
    }

    private static void require(Map<String, Integer> indexes, String header) {
        if (!indexes.containsKey(header)) {
            throw new IllegalArgumentException("missing required header: " + header);
        }
    }

    private static String rawCell(List<String> row, Integer index) {
        if (index == null || index < 0 || index >= row.size()) {
            return "";
        }
        return row.get(index);
    }

    private static String cell(List<String> row, Integer index) {
        return rawCell(row, index).trim();
    }

    private static boolean isEmptyRecord(List<String> row) {
        return row.size() == 1 && row.get(0).trim().isEmpty();
    }

    private static String reason(Throwable exception) {
        final String message = exception.getMessage();
        return exception.getClass().getSimpleName() + (message == null ? "" : ": " + message);
    }

    private static void writeRecord(BufferedWriter writer, List<String> values, String lineEnding)
            throws IOException {
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                writer.write(',');
            }
            writer.write(Csv.escape(values.get(i)));
        }
        writer.write(lineEnding);
    }

    private static void moveAtomically(Path temporary, Path output) throws IOException {
        try {
            Files.move(temporary, output, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(temporary, output, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static final class ExportRow {
        private final String vesselId;
        private final String date;
        private final String foc;
        private final Set<QualityFlag> flags;

        private ExportRow(String vesselId, String date, String foc, Set<QualityFlag> flags) {
            this.vesselId = vesselId;
            this.date = date;
            this.foc = foc;
            this.flags = flags;
        }

        private List<String> values(List<String> columns) {
            final List<String> values = new ArrayList<String>();
            for (String column : columns) {
                if ("vessel_id".equals(column)) {
                    values.add(vesselId);
                } else if ("date".equals(column)) {
                    values.add(date);
                } else if ("FUEL_CONSUMP".equals(column)) {
                    values.add(foc);
                } else if ("quality_flags".equals(column)) {
                    values.add(joinFlags(flags));
                }
            }
            return values;
        }
    }

    private static String joinFlags(Set<QualityFlag> flags) {
        final StringJoiner joiner = new StringJoiner("|");
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
        private Charset charset = StandardCharsets.UTF_8;
        private DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        private int scale = 6;
        private RoundingMode roundingMode = RoundingMode.HALF_UP;
        private List<String> outputColumns = AVAILABLE_COLUMNS;
        private String lineEnding = "\n";
        private boolean qualifiedOnly = false;

        private static Options parse(String[] args) {
            final Options options = new Options();
            for (int i = 0; i < args.length; i++) {
                final String key = args[i];
                if ("--help".equals(key) || "-h".equals(key)) {
                    printUsage();
                    System.exit(0);
                }
                if ("--qualified-only".equals(key)) {
                    options.qualifiedOnly = true;
                    continue;
                }
                if (i + 1 >= args.length) {
                    throw new IllegalArgumentException("missing value for " + key);
                }
                final String value = args[++i];
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
                } else if ("--charset".equals(key)) {
                    options.charset = Charset.forName(value);
                } else if ("--date-format".equals(key)) {
                    options.dateFormatter = DateTimeFormatter.ofPattern(value);
                } else if ("--scale".equals(key)) {
                    options.scale = Integer.parseInt(value);
                    if (options.scale < 0) {
                        throw new IllegalArgumentException("--scale must be non-negative");
                    }
                } else if ("--rounding-mode".equals(key)) {
                    options.roundingMode = RoundingMode.valueOf(value);
                } else if ("--output-columns".equals(key)) {
                    options.outputColumns = parseOutputColumns(value);
                } else if ("--line-ending".equals(key)) {
                    if ("lf".equals(value)) {
                        options.lineEnding = "\n";
                    } else if ("crlf".equals(value)) {
                        options.lineEnding = "\r\n";
                    } else {
                        throw new IllegalArgumentException("--line-ending must be lf or crlf");
                    }
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

        private static List<String> parseOutputColumns(String value) {
            final List<String> columns = new ArrayList<String>();
            for (String column : value.split(",", -1)) {
                if (!AVAILABLE_COLUMNS.contains(column) || columns.contains(column)) {
                    throw new IllegalArgumentException("invalid or duplicate output column: " + column);
                }
                columns.add(column);
            }
            if (columns.isEmpty()) {
                throw new IllegalArgumentException("--output-columns must not be empty");
            }
            return List.copyOf(columns);
        }

        private static void printUsage() {
            System.err.println("Usage: export-fuel-consump --input noon.csv --output fuel-consump.csv [options]");
            System.err.println("  --charset NAME             Input charset (default UTF-8; e.g. Big5, MS950, UTF-16)");
            System.err.println("  --date-format PATTERN      Input java.time date pattern (default yyyy-MM-dd)");
            System.err.println("  --scale N                  FUEL_CONSUMP decimal places (default 6)");
            System.err.println("  --rounding-mode NAME       java.math.RoundingMode (default HALF_UP)");
            System.err.println("  --output-columns CSV       Subset/order of vessel_id,date,FUEL_CONSUMP,quality_flags");
            System.err.println("  --line-ending lf|crlf      Output line ending (default lf)");
            System.err.println("  --qualified-only           Emit only rows with empty quality_flags (filtered submission variant;");
            System.err.println("                             default full-dataset output is the iron-rule submission file)");
            System.err.println("  --vessel-id-header NAME    Input vessel id header");
            System.err.println("  --date-header NAME         Input date header");
            System.err.println("  --consump-header NAME      Input fuel consumption header");
            System.err.println("  --hours-header NAME        Input full-speed hours header");
            System.err.println("  --wind-header NAME         Input wind scale header");
        }
    }
}
