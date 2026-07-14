package com.fleetmind.api;

/** Minimal, dependency-free CSV writer (RFC 4180 quoting) for the machine export endpoints. */
final class CsvUtil {
    private CsvUtil() {
    }

    static String cell(Object value) {
        if (value == null) {
            return "";
        }
        String text = String.valueOf(value);
        if (text.indexOf(',') >= 0 || text.indexOf('"') >= 0
                || text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) {
            return '"' + text.replace("\"", "\"\"") + '"';
        }
        return text;
    }

    static String row(Object... cells) {
        StringBuilder line = new StringBuilder();
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) {
                line.append(',');
            }
            line.append(cell(cells[i]));
        }
        return line.append('\n').toString();
    }
}
