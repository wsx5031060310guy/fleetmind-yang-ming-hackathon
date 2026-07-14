package com.fleetmind.api;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Dependency-free noon-report CSV parser + validator (JDK only — no Apache POI). Shares
 * the noon-report column rules with core-calc but does not persist or recompute: it
 * produces a preview of accepted/rejected rows with per-row quality flags. Handles
 * UTF-8 and Big5/CP950 (with BOM stripping), header aliasing (zh/en), full-width digit
 * normalisation, multi-format dates (incl. Excel serial), idempotent vesselId+date
 * de-duplication and vessel-whitelist rejection.
 */
final class NoonReportCsvParser {
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final int MAX_ROW_ERRORS = 1000;
    private static final List<String> REQUIRED = List.of("vesselId", "date", "stwKn", "dailyFocMt");
    private static final Map<String, String> HEADER_ALIASES = buildAliases();
    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("yyyy.MM.dd"),
            DateTimeFormatter.ofPattern("yyyyMMdd"),
    };

    private NoonReportCsvParser() {
    }

    static Result parse(byte[] bytes, Set<String> vesselWhitelist,
            Map<String, String> fuelMapping, String fuelDefault) {
        Result result = new Result();
        if (bytes == null || bytes.length == 0) {
            result.fileError = "EMPTY_FILE";
            return result;
        }
        if (bytes.length > MAX_BYTES) {
            result.fileError = "FILE_TOO_LARGE";
            return result;
        }

        Decoded decoded = decode(bytes);
        result.detectedEncoding = decoded.encoding();
        String[] lines = decoded.text().split("\r\n|\r|\n", -1);

        int headerIndex = firstNonBlank(lines, 0);
        if (headerIndex < 0) {
            result.fileError = "EMPTY_FILE";
            return result;
        }

        Map<String, Integer> columns = mapColumns(splitCsv(lines[headerIndex]));
        List<String> missing = new ArrayList<>();
        for (String required : REQUIRED) {
            if (!columns.containsKey(required)) {
                missing.add(required);
            }
        }
        if (!missing.isEmpty()) {
            result.fileError = "MISSING_REQUIRED_COLUMNS";
            result.missingColumns = missing;
            return result;
        }

        Set<String> whitelist = upperCopy(vesselWhitelist);
        Map<String, String> fuelByUpper = upperKeys(fuelMapping);
        String defaultFuel = fuelDefault == null || fuelDefault.isBlank() ? "VLSFO" : fuelDefault.trim();

        // Distinct accepted keys (vesselId|date); last row wins on duplicates.
        Map<String, Boolean> acceptedKeys = new LinkedHashMap<>();

        boolean sawData = false;
        for (int i = headerIndex + 1; i < lines.length; i++) {
            if (lines[i].isBlank()) {
                continue;
            }
            sawData = true;
            result.totalRows++;
            int rowIndex = i + 1; // 1-based file line number

            List<String> cells = splitCsv(lines[i]);
            String vesselRaw = cell(cells, columns.get("vesselId"));
            String dateRaw = cell(cells, columns.get("date"));
            String stwRaw = cell(cells, columns.get("stwKn"));
            String focRaw = cell(cells, columns.get("dailyFocMt"));
            String fuelRaw = cell(cells, columns.get("fuelType"));
            String windRaw = cell(cells, columns.get("windScale"));

            List<String> flags = new ArrayList<>();

            String vesselId = vesselRaw.trim().toUpperCase(Locale.ROOT);
            if (vesselId.isEmpty()) {
                reject(result, rowIndex, vesselId, dateRaw, "BLANK_VESSEL_ID");
                continue;
            }
            if (!whitelist.isEmpty() && !whitelist.contains(vesselId)) {
                reject(result, rowIndex, vesselId, dateRaw, "UNKNOWN_VESSEL");
                continue;
            }

            LocalDate date = parseDate(dateRaw);
            if (date == null) {
                reject(result, rowIndex, vesselId, dateRaw, "INVALID_DATE");
                continue;
            }
            String isoDate = date.toString();

            Double stw = parseDouble(stwRaw);
            if (stw == null || !Double.isFinite(stw) || stw <= 0.0) {
                reject(result, rowIndex, vesselId, isoDate, "INVALID_STW");
                continue;
            }

            Double foc = parseDouble(focRaw);
            if (foc == null || !Double.isFinite(foc)) {
                flags.add("BLANK_FOC");
            }

            if (!windRaw.isBlank()) {
                Double wind = parseDouble(windRaw);
                if (wind == null || wind < 0 || wind > 12 || wind != Math.floor(wind)) {
                    flags.add("WIND_SCALE_OUT_OF_RANGE");
                }
            }

            String fuelKey = fuelRaw.trim().toUpperCase(Locale.ROOT);
            if (fuelKey.isEmpty() || !fuelByUpper.containsKey(fuelKey)) {
                flags.add("FUEL_TYPE_UNMAPPED");
            }

            String key = vesselId + "|" + isoDate;
            if (acceptedKeys.containsKey(key)) {
                result.overwrites++;
                flags.add("DUP_IN_FILE");
            }
            acceptedKeys.put(key, Boolean.TRUE);

            if (!flags.isEmpty()) {
                addRowError(result, new RowErrorDto(rowIndex, vesselId, isoDate,
                        "ACCEPTED_WITH_FLAGS", flags));
            }
        }

        if (!sawData) {
            result.fileError = "HEADER_ONLY";
            return result;
        }
        result.accepted = acceptedKeys.size();
        return result;
    }

    private static void reject(Result result, int rowIndex, String vesselId,
            String date, String reason) {
        result.rejected++;
        addRowError(result, new RowErrorDto(rowIndex, vesselId, date, reason, List.of(reason)));
    }

    private static void addRowError(Result result, RowErrorDto error) {
        if (result.rowErrors.size() < MAX_ROW_ERRORS) {
            result.rowErrors.add(error);
        }
    }

    // --- header handling ---

    private static Map<String, Integer> mapColumns(List<String> header) {
        Map<String, Integer> columns = new HashMap<>();
        for (int i = 0; i < header.size(); i++) {
            String canonical = HEADER_ALIASES.get(normalizeHeader(header.get(i)));
            if (canonical != null && !columns.containsKey(canonical)) {
                columns.put(canonical, i);
            }
        }
        return columns;
    }

    private static String normalizeHeader(String raw) {
        return raw == null ? "" : raw.replace("﻿", "").trim()
                .toLowerCase(Locale.ROOT).replaceAll("[\\s_\\-]", "");
    }

    private static Map<String, String> buildAliases() {
        Map<String, String> aliases = new HashMap<>();
        putAliases(aliases, "vesselId", "vesselid", "vessel", "vesselcode", "shipid", "imo",
                "船舶", "船名", "船編", "船號", "船舶編號", "船舶代號");
        putAliases(aliases, "date", "date", "reportdate", "noondate",
                "日期", "報表日期", "報告日期", "正午日期");
        putAliases(aliases, "stwKn", "stwkn", "stw", "speed", "speedkn", "speedthroughwater",
                "船速", "對水船速", "航速");
        putAliases(aliases, "dailyFocMt", "dailyfocmt", "foc", "dailyfoc", "focmt", "fuel",
                "fuelconsumption", "dailyfuel", "油耗", "日油耗", "每日油耗", "燃油消耗");
        putAliases(aliases, "fuelType", "fueltype", "油種", "燃料", "燃料種類", "燃油種類");
        putAliases(aliases, "windScale", "windscale", "wind", "beaufort",
                "風力", "風級", "蒲福風級");
        putAliases(aliases, "hoursSteamed", "hourssteamed", "hours", "steaminghours",
                "航行時數", "時數", "航行小時");
        return aliases;
    }

    private static void putAliases(Map<String, String> aliases, String canonical, String... names) {
        for (String name : names) {
            aliases.put(normalizeHeader(name), canonical);
        }
    }

    // --- cell parsing ---

    private static List<String> splitCsv(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        current.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    current.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                cells.add(current.toString());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        cells.add(current.toString());
        return cells;
    }

    private static String cell(List<String> cells, Integer index) {
        if (index == null || index < 0 || index >= cells.size()) {
            return "";
        }
        return cells.get(index);
    }

    private static Double parseDouble(String raw) {
        String normalized = normalizeNumber(raw);
        if (normalized.isEmpty()) {
            return null;
        }
        try {
            return Double.parseDouble(normalized);
        } catch (NumberFormatException notNumber) {
            return null;
        }
    }

    private static String normalizeNumber(String raw) {
        if (raw == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= 0xFF10 && c <= 0xFF19) {
                c = (char) (c - 0xFEE0); // full-width digits -> ASCII
            } else if (c == 0xFF0E) {
                c = '.'; // full-width full stop
            } else if (c == 0xFF0D || c == '−') {
                c = '-'; // full-width / unicode minus
            }
            if (c == ',' || c == '，' || Character.isWhitespace(c)) {
                continue; // thousands separators / spaces
            }
            out.append(c);
        }
        return out.toString().trim();
    }

    private static LocalDate parseDate(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            return null;
        }
        if (value.matches("\\d{1,6}")) {
            long serial = Long.parseLong(value);
            if (serial >= 15000 && serial <= 80000) { // Excel serial (~1941..2119)
                return LocalDate.of(1899, 12, 30).plusDays(serial);
            }
        }
        for (DateTimeFormatter format : DATE_FORMATS) {
            try {
                return LocalDate.parse(value, format);
            } catch (DateTimeParseException ignore) {
                // try next format
            }
        }
        return null;
    }

    // --- encoding ---

    private static Decoded decode(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xEF
                && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            return new Decoded(new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8), "UTF-8");
        }
        try {
            CharsetDecoder strictUtf8 = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            String text = strictUtf8.decode(ByteBuffer.wrap(bytes)).toString();
            return new Decoded(text, "UTF-8");
        } catch (CharacterCodingException notUtf8) {
            Charset big5 = big5Charset();
            return new Decoded(new String(bytes, big5), big5.name());
        }
    }

    private static Charset big5Charset() {
        for (String name : new String[] {"x-windows-950", "MS950", "Big5"}) {
            if (Charset.isSupported(name)) {
                return Charset.forName(name);
            }
        }
        return StandardCharsets.UTF_8;
    }

    private static int firstNonBlank(String[] lines, int from) {
        for (int i = from; i < lines.length; i++) {
            if (!lines[i].isBlank()) {
                return i;
            }
        }
        return -1;
    }

    private static Set<String> upperCopy(Set<String> values) {
        Set<String> upper = new java.util.HashSet<>();
        if (values != null) {
            for (String value : values) {
                if (value != null) {
                    upper.add(value.trim().toUpperCase(Locale.ROOT));
                }
            }
        }
        return upper;
    }

    private static Map<String, String> upperKeys(Map<String, String> mapping) {
        Map<String, String> upper = new HashMap<>();
        if (mapping != null) {
            for (Map.Entry<String, String> entry : mapping.entrySet()) {
                if (entry.getKey() != null) {
                    upper.put(entry.getKey().trim().toUpperCase(Locale.ROOT), entry.getValue());
                }
            }
        }
        return upper;
    }

    private record Decoded(String text, String encoding) {
    }

    static final class Result {
        String fileError;
        List<String> missingColumns = List.of();
        String detectedEncoding;
        int totalRows;
        int accepted;
        int rejected;
        int overwrites;
        List<RowErrorDto> rowErrors = new ArrayList<>();
    }
}
