#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/schema-inventory.sh [--output build/schema-inventory.csv] <csv-or-tsv-file-or-directory>...

Scans CSV/TSV files and writes a schema-only inventory:
file, format, byte_count, row_count, column_count, headers, status.

Safety:
- Does not print cell values.
- Put raw enterprise data outside the repo, or under ignored data/raw/ or data/private/.
- Prefer writing generated inventory to ignored build/.
EOF
}

OUTPUT=""
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

ruby -rcsv -rfind -rfileutils -e '
output = ARGV.shift
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
files.sort.each do |file|
  begin
    sep = col_sep(file)
    header_line = nil
    File.open(file, "r:bom|utf-8") { |io| header_line = io.gets }
    headers = header_line ? CSV.parse_line(header_line, col_sep: sep) : []
    headers ||= []
    row_count = 0
    CSV.foreach(file, headers: true, col_sep: sep, encoding: "bom|utf-8") do |row|
      next if row.fields.all? { |value| value.nil? || value.to_s.strip.empty? }
      row_count += 1
    end
    rows << [file, File.extname(file).delete_prefix(".").downcase, File.size(file), row_count, headers.length, headers.join("|"), "ok"]
  rescue StandardError => e
    rows << [file, File.extname(file).delete_prefix(".").downcase, File.exist?(file) ? File.size(file) : "", "", "", "", "error: #{e.class}: #{e.message}"]
  end
end

content = CSV.generate do |csv|
  csv << ["file", "format", "byte_count", "row_count", "column_count", "headers", "status"]
  rows.each { |row| csv << row }
end

if output.nil? || output.empty?
  print content
else
  FileUtils.mkdir_p(File.dirname(output))
  File.write(output, content)
  warn "wrote #{output}"
end

exit(rows.any? { |row| !row.last.start_with?("ok") } ? 1 : 0)
' "$OUTPUT" "${PATHS[@]}"
