#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/schema-inventory.sh [--strict] [--output build/schema-inventory.csv] <csv-or-tsv-file-or-directory>...

Scans CSV/TSV files and writes a schema-only inventory:
file, format, byte_count, row_count, column_count, min/max row width, BOM, headers, status.

Blank/duplicate headers, BOM, and row-width mismatches warn by default.
--strict makes these schema defects fail.

Safety:
- Does not print cell values.
- Put raw enterprise data outside the repo, or under ignored data/raw/ or data/private/.
- Prefer writing generated inventory to ignored build/.
EOF
}

OUTPUT=""
STRICT=false
PATHS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --output" >&2
        exit 2
      fi
      OUTPUT="$2"
      shift 2
      ;;
    --strict)
      STRICT=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
    *)
      PATHS+=("$1")
      shift
      ;;
  esac
done

if [[ "${#PATHS[@]}" -eq 0 ]]; then
  usage >&2
  exit 2
fi

if ! command -v ruby >/dev/null 2>&1; then
  echo "ruby is required; verify macOS Ruby or install with: brew install ruby" >&2
  exit 2
fi

ruby -rcsv -rfind -rfileutils -e '
output = ARGV.shift
strict = ARGV.shift == "true"
paths = ARGV

def csv_like?(path)
  ext = File.extname(path).downcase
  ext == ".csv" || ext == ".tsv"
end

def col_sep(path)
  File.extname(path).downcase == ".tsv" ? "\t" : ","
end

files = []
paths.each do |path|
  if File.directory?(path)
    Find.find(path) do |entry|
      next unless File.file?(entry)
      files << entry if csv_like?(entry)
    end
  elsif File.file?(path)
    files << path if csv_like?(path)
  else
    warn "missing path: #{path}"
  end
end

if files.empty?
  warn "no CSV/TSV files found"
  exit 1
end

rows = []
schema_defect = false
files.sort.each do |file|
  begin
    sep = col_sep(file)
    bom = File.open(file, "rb") { |io| io.read(3) == "\xEF\xBB\xBF".b }
    parsed = CSV.read(file, col_sep: sep, encoding: "bom|utf-8")
    headers = parsed.shift || []
    headers ||= []
    data_rows = parsed.reject { |row| row.all? { |value| value.nil? || value.to_s.strip.empty? } }
    widths = data_rows.map(&:length)
    min_width = widths.empty? ? headers.length : widths.min
    max_width = widths.empty? ? headers.length : widths.max
    defects = []
    defects << "blank_header" if headers.any? { |header| header.nil? || header.to_s.strip.empty? }
    normalized = headers.map { |header| header.to_s.strip }
    defects << "duplicate_header" if normalized.uniq.length != normalized.length
    defects << "row_width_mismatch" if widths.any? { |width| width != headers.length }
    defects << "bom" if bom
    unless defects.empty?
      schema_defect = true
      warn "#{strict ? "FAIL" : "WARN"} #{file}: #{defects.join(",")} header_width=#{headers.length} min_width=#{min_width} max_width=#{max_width}"
    end
    status = defects.empty? ? "ok" : "warning: #{defects.join("|")}"
    rows << [file, File.extname(file).sub(/\A\./, "").downcase, File.size(file), data_rows.length, headers.length, min_width, max_width, bom ? "yes" : "no", headers.join("|"), status]
  rescue StandardError => e
    rows << [file, File.extname(file).sub(/\A\./, "").downcase, File.exist?(file) ? File.size(file) : "", "", "", "", "", "", "", "error: #{e.class}: #{e.message}"]
  end
end

content = CSV.generate do |csv|
  csv << ["file", "format", "byte_count", "row_count", "column_count", "min_row_width", "max_row_width", "bom", "headers", "status"]
  rows.each { |row| csv << row }
end

if output.nil? || output.empty?
  print content
else
  FileUtils.mkdir_p(File.dirname(output))
  File.write(output, content)
  warn "wrote #{output}"
end

parse_error = rows.any? { |row| row.last.start_with?("error:") }
exit(parse_error || (strict && schema_defect) ? 1 : 0)
' "$OUTPUT" "$STRICT" "${PATHS[@]}"
