package com.fleetmind.corecalc;

import java.io.IOException;
import java.io.PushbackReader;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

final class Csv {
    private Csv() {
    }

    static List<String> parseLine(String line) {
        List<String> cells = new ArrayList<String>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(ch);
            }
        }
        cells.add(cell.toString());
        return cells;
    }

    static RecordReader recordReader(Reader reader) {
        return new RecordReader(reader);
    }

    static String escape(String value) {
        if (value == null) {
            return "";
        }
        boolean needsQuotes = value.indexOf(',') >= 0 || value.indexOf('"') >= 0
                || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0;
        if (!needsQuotes) {
            return value;
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }


    static final class RecordReader implements AutoCloseable {
        private final PushbackReader reader;
        private boolean finished;

        private RecordReader(Reader reader) {
            this.reader = new PushbackReader(reader, 1);
        }

        List<String> nextRecord() throws IOException {
            if (finished) {
                return null;
            }

            final List<String> cells = new ArrayList<String>();
            final StringBuilder cell = new StringBuilder();
            boolean quoted = false;
            boolean sawCharacter = false;
            while (true) {
                final int value = reader.read();
                if (value == -1) {
                    finished = true;
                    if (!sawCharacter && cells.isEmpty() && cell.length() == 0) {
                        return null;
                    }
                    cells.add(cell.toString());
                    return cells;
                }

                sawCharacter = true;
                final char ch = (char) value;
                if (quoted) {
                    if (ch == '"') {
                        final int next = reader.read();
                        if (next == '"') {
                            cell.append('"');
                        } else {
                            quoted = false;
                            if (next != -1) {
                                reader.unread(next);
                            } else {
                                finished = true;
                                cells.add(cell.toString());
                                return cells;
                            }
                        }
                    } else {
                        cell.append(ch);
                    }
                } else if (ch == '"') {
                    quoted = true;
                } else if (ch == ',') {
                    cells.add(cell.toString());
                    cell.setLength(0);
                } else if (ch == '\n') {
                    cells.add(cell.toString());
                    return cells;
                } else if (ch == '\r') {
                    final int next = reader.read();
                    if (next != '\n' && next != -1) {
                        reader.unread(next);
                    }
                    cells.add(cell.toString());
                    return cells;
                } else {
                    cell.append(ch);
                }
            }
        }

        @Override
        public void close() throws IOException {
            reader.close();
        }
    }
}
