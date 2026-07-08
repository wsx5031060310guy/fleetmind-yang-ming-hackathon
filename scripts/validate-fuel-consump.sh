#!/usr/bin/env bash
set -euo pipefail

INPUT=""
EXPECTED_ROWS=""
MAX_DECIMALS=6
COLUMNS="vessel_id,date,FUEL_CONSUMP,quality_flags"

usage() {
  cat <<'EOF'
Usage:
  scripts/validate-fuel-consump.sh --input fuel-consump.csv [--expected-rows N] [--max-decimals N] [--columns csv]

Validates the current FleetMind FUEL_CONSUMP export shape:
- exact header order
- optional expected row count
- duplicate vessel_id/date keys
- ISO date strings
- non-negative numeric FUEL_CONSUMP values with bounded decimal precision
- quality_flags as pipe-separated uppercase tokens
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --input" >&2
        exit 2
      fi
      INPUT="$2"
      shift 2
      ;;
    --expected-rows)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --expected-rows" >&2
        exit 2
      fi
      EXPECTED_ROWS="$2"
      shift 2
      ;;
    --max-decimals)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --max-decimals" >&2
        exit 2
      fi
      MAX_DECIMALS="$2"
      shift 2
      ;;
    --columns)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --columns" >&2
        exit 2
      fi
      COLUMNS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$INPUT" ]]; then
  usage >&2
  exit 2
fi

ruby -rcsv -e '
input = ARGV.fetch(0)
expected_rows = ARGV.fetch(1)
max_decimals = Integer(ARGV.fetch(2))
expected_headers = ARGV.fetch(3).split(",")

errors = []
unless File.file?(input)
  warn "missing input: #{input}"
  exit 2
end

table = CSV.read(input, headers: true, encoding: "bom|utf-8")
headers = table.headers
if headers != expected_headers
  errors << "header mismatch: expected #{expected_headers.join(",")} got #{headers.join(",")}"
end

seen = {}
blank_foc = 0
numeric_re = /\A\d+(?:\.\d{1,#{max_decimals}})?\z/

table.each_with_index do |row, index|
  line = index + 2
  vessel_id = row["vessel_id"].to_s.strip
  date = row["date"].to_s.strip
  foc = row["FUEL_CONSUMP"].to_s.strip
  flags = row["quality_flags"].to_s.strip

  errors << "line #{line}: missing vessel_id" if vessel_id.empty?
  errors << "line #{line}: date must be ISO yyyy-mm-dd" unless date.match?(/\A\d{4}-\d{2}-\d{2}\z/)

  key = "#{vessel_id}\t#{date}"
  if seen[key]
    errors << "line #{line}: duplicate vessel_id/date key"
  else
    seen[key] = true
  end

  if foc.empty?
    blank_foc += 1
  elsif !foc.match?(numeric_re)
    errors << "line #{line}: FUEL_CONSUMP must be non-negative numeric with <= #{max_decimals} decimals"
  end

  unless flags.empty?
    flags.split("|").each do |flag|
      errors << "line #{line}: invalid quality flag token" unless flag.match?(/\A[A-Z0-9_]+\z/)
    end
  end
end

if !expected_rows.empty? && table.length != Integer(expected_rows)
  errors << "row count mismatch: expected #{expected_rows} got #{table.length}"
end

if errors.empty?
  puts "fuel-consump validation passed rows=#{table.length} blank_foc=#{blank_foc} max_decimals=#{max_decimals}"
else
  errors.each { |error| warn error }
  exit 1
end
' "$INPUT" "$EXPECTED_ROWS" "$MAX_DECIMALS" "$COLUMNS"
