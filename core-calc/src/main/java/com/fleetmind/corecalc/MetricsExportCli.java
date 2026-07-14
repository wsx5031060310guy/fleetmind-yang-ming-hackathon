package com.fleetmind.corecalc;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Exports the private Yang Ming CSVs into the dependency-free dashboard metrics snapshot. */
public final class MetricsExportCli {
    private static final LocalDate SYNTHETIC_EPOCH = LocalDate.of(2021, 1, 1);
    private static final int EVENT_WINDOW_DAYS = 30;
    private static final int MIN_EVENT_SAMPLES = 5;

    // Hackathon business counterfactual assumption; judges can replace this without changing physics.
    private static final double FUEL_PRICE_USD_PER_MT = 650.0;
    private static final double CLEANING_COST_USD = 40_000.0;
    private static final double CARBON_PRICE_USD_PER_TON = 90.0;
    private static final double EU_ETS_COVERAGE_RATE = 0.5;

    private static final List<FuelColumn> FUEL_COLUMNS = List.of(
            new FuelColumn("ME_FULLSPEED_CONSUMP_HSHFO", FuelType.HFO),
            new FuelColumn("ME_FULLSPEED_CONSUMP_ULSFO", FuelType.ULSFO),
            new FuelColumn("ME_FULLSPEED_CONSUMP_VLSFO", FuelType.VLSFO),
            new FuelColumn("ME_FULLSPEED_CONSUMP_LSMGO", FuelType.MGO),
            // No separate LCV was supplied for BIO_HSFO; use the HFO/VLSFO 40.2 baseline.
            new FuelColumn("ME_FULLSPEED_CONSUMP_BIO_HSFO", FuelType.HFO));

    private MetricsExportCli() {
    }

    public static void main(String[] args) throws IOException {
        Options options = Options.parse(args);
        CsvTable voyages = CsvTable.read(options.dataDir.resolve("vt_fd.csv"));
        CsvTable maintenanceTable = CsvTable.read(options.dataDir.resolve("maintenance.csv"));
        List<MaintenanceRow> maintenance = readMaintenance(maintenanceTable);

        ExportResult result = export(voyages, maintenance);
        writeJson(options.output, result.root);
        printSummary(result, options.output);
    }

    private static ExportResult export(CsvTable voyages, List<MaintenanceRow> maintenance) {
        Map<String, List<DailyPoint>> pointsByShip = new LinkedHashMap<>();
        Map<String, Integer> rowsByShip = new HashMap<>();
        Map<String, Integer> qualifiedByShip = new HashMap<>();
        Map<String, Integer> flagCounts = new LinkedHashMap<>();
        int finiteFocRows = 0;
        int totalRows = 0;

        for (List<String> row : voyages.rows) {
            if (isEmpty(row)) {
                continue;
            }
            totalRows++;
            String shipId = voyages.cell(row, "De-identification Name").trim();
            int day = parseRequiredInt(voyages.cell(row, "NOON_UTC"), "NOON_UTC");
            Double hours = parseNullableDouble(voyages.cell(row, "HOURS_FULL_SPEED"));
            Integer windScale = parseWindScale(voyages.cell(row, "WIND_SCALE"));
            EnumSet<QualityFlag> flags = CoreCalc.qualityFlags(windScale, hours);
            String rawWind = voyages.cell(row, "WIND_SCALE").trim();
            if (!rawWind.isEmpty()) {
                Double parsedWind = parseNullableDouble(rawWind);
                if (parsedWind != null && Math.rint(parsedWind) != parsedWind) {
                    flags.add(QualityFlag.NON_INTEGER_WIND_SCALE);
                }
            }

            FuelReading fuel = readFuel(voyages, row);
            flags.addAll(fuel.flags);
            double dailyFoc = CoreCalc.dailyFoc(fuel.vlsfoEquivalent,
                    hours == null ? Double.NaN : hours);
            if (!Double.isFinite(dailyFoc)) {
                flags.add(QualityFlag.NONFINITE_FOC);
            } else {
                finiteFocRows++;
            }
            Double speed = parseNullableDouble(voyages.cell(row, "SPEED_THROUGH_WATER"));
            DailyPoint point = new DailyPoint(SYNTHETIC_EPOCH.plusDays(day), dailyFoc,
                    speed == null ? Double.NaN : speed, flags);
            pointsByShip.computeIfAbsent(shipId, ignored -> new ArrayList<>()).add(point);
            rowsByShip.merge(shipId, 1, Integer::sum);
            if (isQualified(point)) {
                qualifiedByShip.merge(shipId, 1, Integer::sum);
            }
            for (QualityFlag flag : flags) {
                flagCounts.merge(flag.name(), 1, Integer::sum);
            }
        }
        for (QualityFlag flag : QualityFlag.values()) {
            flagCounts.putIfAbsent(flag.name(), 0);
        }

        Map<String, List<EventRecord>> eventsByShip = mapEvents(maintenance);
        printEventMappingReport(pointsByShip, eventsByShip);
        List<ShipResult> shipResults = new ArrayList<>();
        int totalQualified = 0;
        for (String shipId : pointsByShip.keySet()) {
            List<DailyPoint> points = pointsByShip.get(shipId);
            points.sort(Comparator.comparing(DailyPoint::date));
            List<EventRecord> eventRecords = eventsByShip.getOrDefault(shipId, List.of());
            List<MaintenanceEvent> events = eventRecords.stream().map(EventRecord::event).toList();
            int qualified = qualifiedByShip.getOrDefault(shipId, 0);
            totalQualified += qualified;
            shipResults.add(processShip(shipId, points, eventRecords, events,
                    rowsByShip.getOrDefault(shipId, 0), qualified));
        }

        shipResults.sort(Comparator
                .comparingDouble((ShipResult ship) -> finiteOrZero(ship.latestSpeedLossPct)).reversed()
                .thenComparing(ship -> ship.shipId));
        List<Object> fleet = new ArrayList<>();
        Map<String, Object> vessels = new LinkedHashMap<>();
        for (int i = 0; i < shipResults.size(); i++) {
            ShipResult ship = shipResults.get(i);
            Map<String, Object> summary = new LinkedHashMap<>(ship.summary);
            summary.put("reviewPriority", i + 1);
            fleet.add(summary);
            vessels.put(ship.shipId, ship.vessel);
        }

        Map<String, Object> quality = new LinkedHashMap<>();
        // Every source row is exported; masked/invalid FOC is represented as null, never dropped.
        quality.put("exportedRows", totalRows);
        quality.put("totalRows", totalRows);
        quality.put("flagCounts", flagCounts);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("fleet", fleet);
        root.put("vessels", vessels);
        root.put("dataQuality", quality);
        return new ExportResult(root, shipResults, totalQualified, totalRows, finiteFocRows);
    }

    private static ShipResult processShip(String shipId, List<DailyPoint> points,
            List<EventRecord> eventRecords, List<MaintenanceEvent> events,
            int totalRows, int qualifiedDays) {
        ReferenceWindow reference = SpeedLoss.referenceWindow(points,
                SpeedLoss.DEFAULT_REFERENCE_MIN_DAYS,
                SpeedLoss.DEFAULT_REFERENCE_MAX_DAYS,
                SpeedLoss.DEFAULT_REFERENCE_CALENDAR_CAP_DAYS);
        SpeedLossResult series = SpeedLoss.speedLossSeries(points, reference,
                SpeedLoss.DEFAULT_EXPONENT);
        double[] rawLoss = series.speedLossPct();
        double[] smoothedLoss = SpeedLoss.rollingMedian(rawLoss,
                SpeedLoss.DEFAULT_ROLLING_MEDIAN_WINDOW);
        double[] kValues = series.kValues();
        AttributionResult attribution = Attribution.attribute(points, events, reference.kRef());
        List<EventValidation> validations = Attribution.validateEvents(points, events,
                EVENT_WINDOW_DAYS);
        Map<MaintenanceEvent, EventValidation> validationByEvent = new HashMap<>();
        validations.forEach(validation -> validationByEvent.put(validation.event(), validation));

        List<Object> performance = new ArrayList<>(points.size());
        double latestSpeedLoss = Double.NaN;
        for (int i = 0; i < points.size(); i++) {
            DailyPoint point = points.get(i);
            double loss = Double.isFinite(rawLoss[i]) ? smoothedLoss[i] : Double.NaN;
            if (Double.isFinite(loss)) {
                latestSpeedLoss = loss;
            }
            Map<String, Object> metric = new LinkedHashMap<>();
            metric.put("vesselId", shipId);
            metric.put("date", point.date().toString());
            metric.put("dailyFoc", finiteOrNull(point.dailyFoc()));
            metric.put("kValue", finiteOrNull(kValues[i]));
            metric.put("speedLossPct", finiteOrNull(loss));
            metric.put("qualityFlags", point.qualityFlags().stream().map(Enum::name).sorted().toList());
            performance.add(metric);
        }

        List<Object> eventJson = new ArrayList<>();
        Map<String, Object> beforeAfter = new LinkedHashMap<>();
        List<String> uwiVerdicts = new ArrayList<>();
        for (EventRecord record : eventRecords) {
            EventValidation validation = validationByEvent.get(record.event);
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("eventId", record.eventId);
            event.put("vesselId", shipId);
            event.put("date", record.event.date().toString());
            event.put("type", record.originalType);
            event.put("eventType", record.originalType);
            event.put("verdict", validation.verdict().name());
            event.put("expectedImprovement", validation.expectedImprovement());
            event.put("measuredDeltaPct", finiteOrNull(validation.measuredDeltaPct()));
            event.put("noiseThresholdPct", finiteOrNull(validation.noiseThresholdPct()));
            event.put("lowConfidence", validation.lowConfidence());
            eventJson.add(event);
            if (record.event.type() == MaintenanceEvent.EventType.UWI) {
                uwiVerdicts.add(record.eventId + "=" + validation.verdict().name());
            }

            BeforeAfterResult comparison = SpeedLoss.beforeAfter(points, record.event.date(),
                    EVENT_WINDOW_DAYS, MIN_EVENT_SAMPLES);
            FocWindow foc = eventFocWindow(points, record.event.date(), EVENT_WINDOW_DAYS);
            BusinessImpactResult impact = BusinessImpact.estimate(
                    foc.afterMedian, foc.beforeMedian, FUEL_PRICE_USD_PER_MT,
                    CLEANING_COST_USD, CARBON_PRICE_USD_PER_TON, EU_ETS_COVERAGE_RATE);
            Map<String, Object> comparisonJson = new LinkedHashMap<>();
            comparisonJson.put("eventId", record.eventId);
            comparisonJson.put("vesselId", shipId);
            comparisonJson.put("medianKBefore", finiteOrNull(comparison.medianKBefore()));
            comparisonJson.put("medianKAfter", finiteOrNull(comparison.medianKAfter()));
            comparisonJson.put("recoveryPct", finiteOrNull(comparison.recoveryPct()));
            comparisonJson.put("businessImpact", businessImpactJson(impact));
            beforeAfter.put(record.eventId, comparisonJson);
        }

        double medianFoc = medianQualifiedFoc(points);
        double penaltyPct = Math.max(0.0,
                finiteOrZero(SpeedLoss.fuelPenaltyPct(attribution.kNow(), attribution.kClean())));
        // Physically bounded savings: returning k from kNow to kClean recovers the fraction
        // (kNow-kClean)/kNow = penalty/(1+penalty) of the CURRENT full-speed FOC, not penalty
        // of the clean FOC. This keeps the saved share and % in [0,100), so a heavily fouled
        // vessel can never "save" more fuel than it currently burns.
        double savedFraction = penaltyPct / (100.0 + penaltyPct); // 0..1
        double totalSavingsMtDay = Double.isFinite(medianFoc)
                ? medianFoc * savedFraction : Double.NaN;
        double savingsPct = savedFraction * 100.0; // 0..100, reported to the UI/deck
        double uwcSavings = totalSavingsMtDay * attribution.hullShare();
        double ppSavings = totalSavingsMtDay * attribution.propellerShare();
        Map<String, Object> counterfactual = new LinkedHashMap<>();
        counterfactual.put("uwcSavingsMtDay", finiteOrNull(uwcSavings));
        counterfactual.put("ppSavingsMtDay", finiteOrNull(ppSavings));
        counterfactual.put("pct", finiteOrNull(savingsPct));
        counterfactual.put("annualSavingsUsd", finiteOrNull(totalSavingsMtDay * 365.0
                * FUEL_PRICE_USD_PER_MT));
        counterfactual.put("fuelPriceUsdPerMt", FUEL_PRICE_USD_PER_MT);

        Map<String, Object> attributionJson = new LinkedHashMap<>();
        attributionJson.put("hullPct", attribution.hullShare() * 100.0);
        attributionJson.put("propPct", attribution.propellerShare() * 100.0);
        attributionJson.put("heuristic", attribution.heuristic());
        attributionJson.put("lowConfidence", attribution.lowConfidence());

        int dataQualityScore = totalRows == 0 ? 0
                : (int) Math.round(qualifiedDays * 100.0 / totalRows);
        String confidence = reference.lowConfidence() || attribution.lowConfidence()
                ? "LOW" : qualifiedDays < 30 ? "MEDIUM" : "HIGH";
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("vesselId", shipId);
        summary.put("latestSpeedLossPct", finiteOrZero(latestSpeedLoss));
        summary.put("foulingAttributionPct", attribution.hullShare() * 100.0);
        summary.put("confidence", confidence);
        summary.put("sampleDays", qualifiedDays);
        summary.put("daysSinceLastCleaning", daysSinceLastHullReset(points, events));
        summary.put("dataQualityScore", dataQualityScore);

        Map<String, Object> vessel = new LinkedHashMap<>();
        vessel.put("performance", performance);
        vessel.put("events", eventJson);
        vessel.put("beforeAfter", beforeAfter);
        vessel.put("attribution", attributionJson);
        vessel.put("counterfactual", counterfactual);
        return new ShipResult(shipId, latestSpeedLoss, summary, vessel,
                attribution.hullShare() * 100.0, attribution.propellerShare() * 100.0,
                uwiVerdicts);
    }

    private static Map<String, Object> businessImpactJson(BusinessImpactResult impact) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("extraFuelMtPerDay", finiteOrNull(impact.extraFuelMtPerDay()));
        json.put("dailyFuelCostUsd", finiteOrNull(impact.dailyFuelCostUsd()));
        json.put("annualizedFuelCostUsd", finiteOrNull(impact.annualizedFuelCostUsd()));
        json.put("dailyCo2MetricTons", finiteOrNull(impact.dailyCo2MetricTons()));
        json.put("annualizedCo2MetricTons", finiteOrNull(impact.annualizedCo2MetricTons()));
        json.put("dailyEuEtsCostUsd", finiteOrNull(impact.dailyEuEtsCostUsd()));
        json.put("annualizedEuEtsCostUsd", finiteOrNull(impact.annualizedEuEtsCostUsd()));
        json.put("dailyAvoidableCostUsd", finiteOrNull(impact.dailyAvoidableCostUsd()));
        json.put("paybackDays", finiteOrNull(impact.paybackDays()));
        return json;
    }

    private static FocWindow eventFocWindow(List<DailyPoint> points, LocalDate eventDate,
            int windowDays) {
        List<Double> before = new ArrayList<>();
        List<Double> after = new ArrayList<>();
        for (DailyPoint point : points) {
            if (!isQualified(point)) {
                continue;
            }
            long beforeDistance = ChronoUnit.DAYS.between(point.date(), eventDate);
            long afterDistance = ChronoUnit.DAYS.between(eventDate, point.date());
            if (beforeDistance >= 1 && beforeDistance <= windowDays) {
                before.add(point.dailyFoc());
            } else if (afterDistance >= 1 && afterDistance <= windowDays) {
                after.add(point.dailyFoc());
            }
        }
        return new FocWindow(SpeedLoss.median(toArray(before)), SpeedLoss.median(toArray(after)));
    }

    private static double medianQualifiedFoc(List<DailyPoint> points) {
        List<Double> values = points.stream().filter(MetricsExportCli::isQualified)
                .map(DailyPoint::dailyFoc).toList();
        return SpeedLoss.median(toArray(values));
    }

    private static int daysSinceLastHullReset(List<DailyPoint> points,
            List<MaintenanceEvent> events) {
        if (points.isEmpty()) {
            return 0;
        }
        LocalDate latest = points.getLast().date();
        LocalDate baseline = points.getFirst().date();
        for (MaintenanceEvent event : events) {
            if (event.resetsHull() && !event.date().isAfter(latest)) {
                baseline = event.date();
            }
        }
        return Math.max(0, Math.toIntExact(ChronoUnit.DAYS.between(baseline, latest)));
    }

    private static Map<String, List<EventRecord>> mapEvents(List<MaintenanceRow> rows) {
        Map<String, Integer> duplicateCounter = new HashMap<>();
        Map<String, List<EventRecord>> result = new LinkedHashMap<>();
        for (MaintenanceRow row : rows) {
            MaintenanceEvent.EventType type = parseEventType(row.eventType);
            LocalDate eventDate = SYNTHETIC_EPOCH.plusDays(row.eventDay);
            MaintenanceEvent event = MaintenanceEvent.of(row.shipId,
                    eventDate, type);
            String base = row.shipId + "-" + row.eventType.replace('+', '-') + "-" + eventDate;
            int occurrence = duplicateCounter.merge(base, 1, Integer::sum);
            String eventId = "event-" + base + (occurrence == 1 ? "" : "-" + occurrence);
            result.computeIfAbsent(row.shipId, ignored -> new ArrayList<>())
                    .add(new EventRecord(eventId, row.eventType, row.eventDay, event));
        }
        result.values().forEach(events -> events.sort(
                Comparator.comparingInt(EventRecord::eventDay).thenComparing(EventRecord::eventId)));
        return result;
    }

    private static void printEventMappingReport(Map<String, List<DailyPoint>> pointsByShip,
            Map<String, List<EventRecord>> eventsByShip) {
        int mapped = 0;
        int outOfRange = 0;
        for (Map.Entry<String, List<EventRecord>> entry : eventsByShip.entrySet()) {
            List<DailyPoint> points = pointsByShip.getOrDefault(entry.getKey(), List.of());
            LocalDate first = points.stream().map(DailyPoint::date).min(LocalDate::compareTo)
                    .orElse(null);
            LocalDate last = points.stream().map(DailyPoint::date).max(LocalDate::compareTo)
                    .orElse(null);
            for (EventRecord record : entry.getValue()) {
                mapped++;
                LocalDate date = record.event.date();
                if (first == null || date.isBefore(first) || date.isAfter(last)) {
                    outOfRange++;
                    System.out.println("event out-of-range: " + record.eventId + " ship="
                            + entry.getKey() + " day=" + record.eventDay);
                }
            }
        }
        System.out.println("events mapped: " + mapped + "; out-of-range: " + outOfRange);
    }

    private static FuelReading readFuel(CsvTable table, List<String> row) {
        List<FuelMass> masses = new ArrayList<>();
        EnumSet<QualityFlag> flags = EnumSet.noneOf(QualityFlag.class);
        boolean invalid = false;
        for (FuelColumn column : FUEL_COLUMNS) {
            String raw = table.cell(row, column.header).trim();
            if (raw.isEmpty()) {
                continue;
            }
            if (isMarker(raw)) {
                continue;
            }
            Double value = parseNullableDouble(raw);
            if (value == null || value < 0.0) {
                invalid = true;
            } else if (value > 0.0) {
                masses.add(new FuelMass(column.type, value));
            }
        }
        if (masses.isEmpty()) {
            flags.add(QualityFlag.MISSING_FUEL_CONSUMP);
        }
        if (invalid) {
            flags.add(QualityFlag.INVALID_FUEL_CONSUMP);
        }
        double equivalent = masses.isEmpty() ? Double.NaN : CoreCalc.vlsfoEquivalent(masses);
        return new FuelReading(equivalent, flags);
    }

    private static List<MaintenanceRow> readMaintenance(CsvTable table) {
        List<MaintenanceRow> result = new ArrayList<>();
        for (List<String> row : table.rows) {
            if (!isEmpty(row)) {
                result.add(new MaintenanceRow(table.cell(row, "ship_id").trim(),
                        table.cell(row, "event_type").trim(),
                        parseRequiredInt(table.cell(row, "event_day"), "event_day")));
            }
        }
        return List.copyOf(result);
    }

    private static MaintenanceEvent.EventType parseEventType(String value) {
        return switch (value) {
            case "PP" -> MaintenanceEvent.EventType.PP;
            case "UWI+PP" -> MaintenanceEvent.EventType.UWI_PP;
            case "UWC" -> MaintenanceEvent.EventType.UWC;
            case "UWC+PP" -> MaintenanceEvent.EventType.UWC_PP;
            case "DD" -> MaintenanceEvent.EventType.DD;
            case "UWI" -> MaintenanceEvent.EventType.UWI;
            default -> throw new IllegalArgumentException("unsupported maintenance event: " + value);
        };
    }

    private static void printSummary(ExportResult result, Path output) {
        System.out.println("metrics: ships processed=" + result.ships.size()
                + ", total qualified days=" + result.totalQualifiedDays
                + ", finite FOC rows=" + result.finiteFocRows + "/" + result.totalRows
                + ", out=" + output);
        for (ShipResult ship : result.ships) {
            System.out.printf(Locale.US, "ship: %s latestSpeedLossPct=%.4f%n",
                    ship.shipId, finiteOrZero(ship.latestSpeedLossPct));
        }
        if (!result.ships.isEmpty()) {
            ShipResult example = result.ships.stream()
                    .filter(ship -> ship.hullPct > 0.0 && ship.hullPct < 100.0)
                    .findFirst().orElse(result.ships.getFirst());
            System.out.printf(Locale.US, "attribution-example: %s hullPct=%.2f propPct=%.2f%n",
                    example.shipId, example.hullPct, example.propPct);
        }
        List<String> uwi = result.ships.stream().flatMap(ship -> ship.uwiVerdicts.stream()).toList();
        System.out.println("UWI verdicts: " + String.join(", ", uwi));
    }

    private static void writeJson(Path output, Map<String, Object> root) throws IOException {
        Path absolute = output.toAbsolutePath();
        if (absolute.getParent() != null) {
            Files.createDirectories(absolute.getParent());
        }
        Path temporary = Path.of(absolute + ".tmp");
        Files.writeString(temporary, Json.write(root) + System.lineSeparator(), StandardCharsets.UTF_8);
        try {
            Files.move(temporary, absolute, StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
            Files.move(temporary, absolute, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static Integer parseWindScale(String raw) {
        Double value = parseNullableDouble(raw);
        return value == null ? null : (int) Math.round(value);
    }

    private static Double parseNullableDouble(String raw) {
        if (raw == null || raw.isBlank() || isMarker(raw)) {
            return null;
        }
        try {
            double value = Double.parseDouble(raw.trim().replace(",", ""));
            return Double.isFinite(value) ? value : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static int parseRequiredInt(String raw, String field) {
        Double value = parseNullableDouble(raw);
        if (value == null || Math.rint(value) != value) {
            throw new IllegalArgumentException("invalid integer " + field + ": " + raw);
        }
        return Math.toIntExact(Math.round(value));
    }

    private static boolean isMarker(String value) {
        return "HIDDEN".equalsIgnoreCase(value.trim()) || "PREDICT".equalsIgnoreCase(value.trim());
    }

    private static boolean isQualified(DailyPoint point) {
        return point.qualityFlags().isEmpty() && Double.isFinite(point.dailyFoc())
                && point.dailyFoc() > 0.0 && Double.isFinite(point.speedKnots())
                && point.speedKnots() > 0.0;
    }

    private static boolean isEmpty(List<String> row) {
        return row.stream().allMatch(String::isBlank);
    }

    private static Double finiteOrNull(double value) {
        return Double.isFinite(value) ? value : null;
    }

    private static double finiteOrZero(double value) {
        return Double.isFinite(value) ? value : 0.0;
    }

    private static double[] toArray(List<Double> values) {
        double[] result = new double[values.size()];
        for (int i = 0; i < values.size(); i++) {
            result[i] = values.get(i);
        }
        return result;
    }

    private record Options(Path dataDir, Path output) {
        private static Options parse(String[] args) {
            Path dataDir = Path.of("data");
            Path output = null;
            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--data-dir" -> dataDir = Path.of(requireValue(args, ++i, "--data-dir"));
                    case "--out" -> output = Path.of(requireValue(args, ++i, "--out"));
                    default -> throw new IllegalArgumentException("unknown argument: " + args[i]);
                }
            }
            if (output == null) {
                throw new IllegalArgumentException("required: --out <path>");
            }
            return new Options(dataDir, output);
        }

        private static String requireValue(String[] args, int index, String option) {
            if (index >= args.length) {
                throw new IllegalArgumentException("missing value for " + option);
            }
            return args[index];
        }
    }

    private static final class CsvTable {
        private final Map<String, Integer> indexes;
        private final List<List<String>> rows;

        private CsvTable(Map<String, Integer> indexes, List<List<String>> rows) {
            this.indexes = indexes;
            this.rows = rows;
        }

        private static CsvTable read(Path path) throws IOException {
            try (Reader input = new InputStreamReader(Files.newInputStream(path), StandardCharsets.UTF_8);
                    Csv.RecordReader reader = Csv.recordReader(input)) {
                List<String> header = reader.nextRecord();
                if (header == null) {
                    throw new IllegalArgumentException("empty CSV: " + path);
                }
                Map<String, Integer> indexes = new LinkedHashMap<>();
                for (int i = 0; i < header.size(); i++) {
                    String name = header.get(i).trim();
                    if (i == 0 && name.startsWith("\uFEFF")) {
                        name = name.substring(1);
                    }
                    if (indexes.put(name, i) != null) {
                        throw new IllegalArgumentException("duplicate CSV header: " + name);
                    }
                }
                List<List<String>> rows = new ArrayList<>();
                List<String> row;
                while ((row = reader.nextRecord()) != null) {
                    rows.add(List.copyOf(row));
                }
                return new CsvTable(Map.copyOf(indexes), List.copyOf(rows));
            }
        }

        private String cell(List<String> row, String header) {
            Integer index = indexes.get(header);
            if (index == null) {
                throw new IllegalArgumentException("missing required header: " + header);
            }
            return index < row.size() ? row.get(index) : "";
        }
    }

    private static final class Json {
        private Json() {
        }

        private static String write(Object value) {
            StringBuilder builder = new StringBuilder(1_000_000);
            append(builder, value);
            return builder.toString();
        }

        @SuppressWarnings("unchecked")
        private static void append(StringBuilder builder, Object value) {
            if (value == null) {
                builder.append("null");
            } else if (value instanceof String string) {
                quote(builder, string);
            } else if (value instanceof Number || value instanceof Boolean) {
                builder.append(value);
            } else if (value instanceof Map<?, ?> map) {
                builder.append('{');
                boolean first = true;
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (!first) {
                        builder.append(',');
                    }
                    first = false;
                    quote(builder, String.valueOf(entry.getKey()));
                    builder.append(':');
                    append(builder, entry.getValue());
                }
                builder.append('}');
            } else if (value instanceof Iterable<?> iterable) {
                builder.append('[');
                boolean first = true;
                for (Object item : iterable) {
                    if (!first) {
                        builder.append(',');
                    }
                    first = false;
                    append(builder, item);
                }
                builder.append(']');
            } else {
                throw new IllegalArgumentException("unsupported JSON value: " + value.getClass());
            }
        }

        private static void quote(StringBuilder builder, String value) {
            builder.append('"');
            for (int i = 0; i < value.length(); i++) {
                char ch = value.charAt(i);
                switch (ch) {
                    case '"' -> builder.append("\\\"");
                    case '\\' -> builder.append("\\\\");
                    case '\b' -> builder.append("\\b");
                    case '\f' -> builder.append("\\f");
                    case '\n' -> builder.append("\\n");
                    case '\r' -> builder.append("\\r");
                    case '\t' -> builder.append("\\t");
                    default -> {
                        if (ch < 0x20) {
                            builder.append(String.format(Locale.ROOT, "\\u%04x", (int) ch));
                        } else {
                            builder.append(ch);
                        }
                    }
                }
            }
            builder.append('"');
        }
    }

    private record FuelColumn(String header, FuelType type) {
    }

    private record FuelReading(double vlsfoEquivalent, EnumSet<QualityFlag> flags) {
    }

    private record MaintenanceRow(String shipId, String eventType, int eventDay) {
    }

    private record EventRecord(String eventId, String originalType, int eventDay,
            MaintenanceEvent event) {
    }

    private record FocWindow(double beforeMedian, double afterMedian) {
    }

    private record ShipResult(String shipId, double latestSpeedLossPct,
            Map<String, Object> summary, Map<String, Object> vessel,
            double hullPct, double propPct, List<String> uwiVerdicts) {
    }

    private record ExportResult(Map<String, Object> root, List<ShipResult> ships,
            int totalQualifiedDays, int totalRows, int finiteFocRows) {
    }
}
