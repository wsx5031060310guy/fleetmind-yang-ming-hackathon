import { randomUUID } from "node:crypto";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROW_ERRORS = 1000;
const REQUIRED = ["vesselId", "date", "stwKn", "dailyFocMt"];

function normalizeHeader(raw) {
  return (raw ?? "").replaceAll("\uFEFF", "").trim().toLowerCase()
    .replace(/[\s_-]/g, "");
}

const HEADER_ALIASES = new Map();
function putAliases(canonical, ...names) {
  for (const name of names) HEADER_ALIASES.set(normalizeHeader(name), canonical);
}
putAliases("vesselId", "vesselid", "vessel", "vesselcode", "shipid", "imo",
  "船舶", "船名", "船編", "船號", "船舶編號", "船舶代號");
putAliases("date", "date", "reportdate", "noondate", "日期", "報表日期", "報告日期", "正午日期");
putAliases("stwKn", "stwkn", "stw", "speed", "speedkn", "speedthroughwater", "船速", "對水船速", "航速");
putAliases("dailyFocMt", "dailyfocmt", "foc", "dailyfoc", "focmt", "fuel",
  "fuelconsumption", "dailyfuel", "油耗", "日油耗", "每日油耗", "燃油消耗");
putAliases("fuelType", "fueltype", "油種", "燃料", "燃料種類", "燃油種類");
putAliases("windScale", "windscale", "wind", "beaufort", "風力", "風級", "蒲福風級");
putAliases("hoursSteamed", "hourssteamed", "hours", "steaminghours", "航行時數", "時數", "航行小時");

function decode(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("big5").decode(bytes), encoding: "x-windows-950" };
  }
}

function splitCsv(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

function mapColumns(header) {
  const columns = new Map();
  header.forEach((cell, index) => {
    const canonical = HEADER_ALIASES.get(normalizeHeader(cell));
    if (canonical && !columns.has(canonical)) columns.set(canonical, index);
  });
  return columns;
}

function cell(cells, index) {
  return index === undefined || index < 0 || index >= cells.length ? "" : cells[index];
}

function normalizeNumber(raw) {
  let output = "";
  for (const original of raw ?? "") {
    let character = original;
    const code = character.charCodeAt(0);
    if (code >= 0xFF10 && code <= 0xFF19) character = String.fromCharCode(code - 0xFEE0);
    else if (code === 0xFF0E) character = ".";
    else if (code === 0xFF0D || character === "−") character = "-";
    if (character === "," || character === "，" || /\s/u.test(character)) continue;
    output += character;
  }
  return output.trim();
}

function parseDouble(raw) {
  const normalized = normalizeNumber(raw);
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isNaN(value) ? null : value;
}

function isoDate(year, month, day) {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const smartDay = Math.min(day, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(smartDay).padStart(2, "0")}`;
}

function parseDate(raw) {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (/^\d{1,6}$/.test(value)) {
    const serial = Number(value);
    if (serial >= 15000 && serial <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30 + serial));
      return date.toISOString().slice(0, 10);
    }
  }
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    ?? value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
    ?? value.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!match) {
    match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  }
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

function addRowError(result, error) {
  if (result.rowErrors.length < MAX_ROW_ERRORS) result.rowErrors.push(error);
}

function reject(result, rowIndex, vesselId, date, reason) {
  result.rejected++;
  addRowError(result, { rowIndex, vesselId, date, reason, qualityFlags: [reason] });
}

export function parseNoonReport(bytes, vesselWhitelist, fuelMapping, fuelDefault) {
  const result = {
    fileError: null,
    missingColumns: [],
    detectedEncoding: null,
    totalRows: 0,
    accepted: 0,
    rejected: 0,
    overwrites: 0,
    rowErrors: []
  };
  if (!bytes || bytes.length === 0) {
    result.fileError = "EMPTY_FILE";
    return result;
  }
  if (bytes.length > MAX_BYTES) {
    result.fileError = "FILE_TOO_LARGE";
    return result;
  }

  const decoded = decode(bytes);
  result.detectedEncoding = decoded.encoding;
  const lines = decoded.text.split(/\r\n|\r|\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex < 0) {
    result.fileError = "EMPTY_FILE";
    return result;
  }
  const columns = mapColumns(splitCsv(lines[headerIndex]));
  result.missingColumns = REQUIRED.filter((required) => !columns.has(required));
  if (result.missingColumns.length > 0) {
    result.fileError = "MISSING_REQUIRED_COLUMNS";
    return result;
  }

  const whitelist = new Set((vesselWhitelist ?? [])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => value.trim().toUpperCase()));
  const fuelByUpper = new Map(Object.entries(fuelMapping ?? {})
    .map(([key, value]) => [key.trim().toUpperCase(), value]));
  void ((fuelDefault ?? "").trim() || "VLSFO");
  const acceptedKeys = new Set();
  let sawData = false;

  for (let index = headerIndex + 1; index < lines.length; index++) {
    if (lines[index].trim() === "") continue;
    sawData = true;
    result.totalRows++;
    const rowIndex = index + 1;
    const cells = splitCsv(lines[index]);
    const vesselRaw = cell(cells, columns.get("vesselId"));
    const dateRaw = cell(cells, columns.get("date"));
    const stwRaw = cell(cells, columns.get("stwKn"));
    const focRaw = cell(cells, columns.get("dailyFocMt"));
    const fuelRaw = cell(cells, columns.get("fuelType"));
    const windRaw = cell(cells, columns.get("windScale"));
    const flags = [];

    const vesselId = vesselRaw.trim().toUpperCase();
    if (vesselId === "") {
      reject(result, rowIndex, vesselId, dateRaw, "BLANK_VESSEL_ID");
      continue;
    }
    if (whitelist.size > 0 && !whitelist.has(vesselId)) {
      reject(result, rowIndex, vesselId, dateRaw, "UNKNOWN_VESSEL");
      continue;
    }
    const date = parseDate(dateRaw);
    if (date === null) {
      reject(result, rowIndex, vesselId, dateRaw, "INVALID_DATE");
      continue;
    }
    const stw = parseDouble(stwRaw);
    if (stw === null || !Number.isFinite(stw) || stw <= 0) {
      reject(result, rowIndex, vesselId, date, "INVALID_STW");
      continue;
    }
    const foc = parseDouble(focRaw);
    if (foc === null || !Number.isFinite(foc)) flags.push("BLANK_FOC");

    if (windRaw.trim() !== "") {
      const wind = parseDouble(windRaw);
      if (wind === null || wind < 0 || wind > 12 || wind !== Math.floor(wind)) {
        flags.push("WIND_SCALE_OUT_OF_RANGE");
      }
    }
    const fuelKey = fuelRaw.trim().toUpperCase();
    if (fuelKey === "" || !fuelByUpper.has(fuelKey)) flags.push("FUEL_TYPE_UNMAPPED");

    const key = `${vesselId}|${date}`;
    if (acceptedKeys.has(key)) {
      result.overwrites++;
      flags.push("DUP_IN_FILE");
    }
    acceptedKeys.add(key);
    if (flags.length > 0) {
      addRowError(result, {
        rowIndex,
        vesselId,
        date,
        reason: "ACCEPTED_WITH_FLAGS",
        qualityFlags: flags
      });
    }
  }

  if (!sawData) {
    result.fileError = "HEADER_ONLY";
    return result;
  }
  result.accepted = acceptedKeys.size;
  return result;
}

function fileErrorMessage(code) {
  return {
    EMPTY_FILE: "檔案為空或僅有空白列",
    FILE_TOO_LARGE: "檔案超過 10MB 上限",
    HEADER_ONLY: "只有表頭、沒有資料列",
    MISSING_REQUIRED_COLUMNS: "缺少必填欄位"
  }[code] ?? code;
}

function rejected(batchId, code, message, missingColumns = []) {
  const detail = missingColumns.length === 0 ? message : `${message}：${missingColumns.join(", ")}`;
  return {
    batchId,
    mode: "rejected",
    message: detail,
    detectedEncoding: null,
    totalRows: 0,
    accepted: 0,
    rejected: 0,
    overwrites: 0,
    missingColumns,
    rowErrors: []
  };
}

export function uploadPreview(fileBytes, dryRun, settings, vesselIds) {
  const batchId = `batch-${randomUUID()}`;
  if (!fileBytes || fileBytes.length === 0) {
    return rejected(batchId, "EMPTY_FILE", "檔案為空或未提供");
  }
  if (fileBytes.length > MAX_BYTES) {
    return rejected(batchId, "FILE_TOO_LARGE", "檔案超過 10MB 上限");
  }
  const parsed = parseNoonReport(fileBytes, vesselIds,
    settings.fuelTypeMapping, settings.fuelTypeDefault);
  if (parsed.fileError !== null) {
    return rejected(batchId, parsed.fileError, fileErrorMessage(parsed.fileError), parsed.missingColumns);
  }
  return {
    batchId,
    mode: dryRun ? "preview" : "preview-only",
    message: dryRun
      ? "dry-run 預覽，未落庫"
      : "preview-only：commit 需重算管線（P1 待接 core-calc runtime 重算），本次未落庫",
    detectedEncoding: parsed.detectedEncoding,
    totalRows: parsed.totalRows,
    accepted: parsed.accepted,
    rejected: parsed.rejected,
    overwrites: parsed.overwrites,
    missingColumns: [],
    rowErrors: parsed.rowErrors
  };
}

export function multipartFile(body, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1] ?? boundaryMatch[2].trim();
  const encoded = body.toString("latin1");
  const marker = `--${boundary}`;
  for (const part of encoded.split(marker)) {
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    if (!/content-disposition:[^\r\n]*\bname="file"/i.test(headers)) continue;
    let payload = part.slice(separator + 4);
    if (payload.endsWith("\r\n")) payload = payload.slice(0, -2);
    return Buffer.from(payload, "latin1");
  }
  return null;
}
