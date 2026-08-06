import {
  FUEL_EXPORT,
  VESSEL_IDS,
  beforeAfter,
  dataQuality,
  performance,
  underwaterEvents
} from "./demo-data.mjs";
import { aiBrief, aiBriefPrompt } from "./ai.mjs";
import { alerts, decision, summaries } from "./decision.mjs";
import { csvRow } from "./csv.mjs";
import {
  adminSnapshot,
  applyPatch,
  readSettings,
  settingsCookie,
  validateThreshold
} from "./settings.mjs";
import { multipartFile, uploadPreview } from "./noon-report.mjs";

const JSON_HEADERS = { "content-type": "application/json" };

function json(body, status = 200, headers = {}) {
  return {
    status,
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body)
  };
}

function text(body, contentType, headers = {}) {
  return { status: 200, headers: { "content-type": contentType, ...headers }, body };
}

function badRequest(message) {
  return json({ message, status: "bad_request" }, 400);
}

function notFound(message = null) {
  return message === null
    ? json({ message: "Not Found", status: "not_found" }, 404)
    : json({ message, status: "not_found" }, 404);
}

function parseJsonBody(body) {
  if (!body || body.length === 0) return null;
  return JSON.parse(body.toString("utf8"));
}

function exportDecision(summary, computedAt) {
  return {
    vesselId: summary.vesselId,
    status: summary.status,
    recommendedAction: summary.recommendedAction,
    latestSpeedLossPct: summary.latestSpeedLossPct,
    thresholdPct: summary.thresholdPct ?? 0,
    forecastDaysToThreshold: summary.forecastDaysToThreshold,
    activeFuelType: summary.activeFuelType,
    reviewPriority: summary.reviewPriority,
    computedAt
  };
}

function parseStatusFilter(raw) {
  if (raw === null || raw.trim() === "") return null;
  const values = raw.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
  return values.length === 0 ? null : new Set(values);
}

function isCsv(value) {
  return value?.toLowerCase() === "csv";
}

function javaDouble(value) {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function parseSince(value) {
  if (value === null || value.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`since must be an ISO-8601 instant: ${value}`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error(`since must be an ISO-8601 instant: ${value}`);
  return timestamp;
}

function notify(settings) {
  const activeAlerts = alerts(settings.thresholdPct);
  const enabled = new Set(settings.channels);
  const channels = ["email", "sns", "ses", "webhook"].map((name) => ({
    name,
    enabled: enabled.has(name),
    configured: false,
    status: enabled.has(name) ? "not_configured" : "disabled"
  }));
  return {
    status: "disabled",
    topicConfigured: false,
    sesConfigured: false,
    webhookConfigured: false,
    alertCount: activeAlerts.length,
    channels
  };
}

export async function dispatch(request) {
  const method = (request.method ?? "GET").toUpperCase();
  const url = new URL(request.url, "http://127.0.0.1");
  const path = url.pathname;
  const headers = request.headers ?? {};
  const cookieHeader = headers.cookie ?? headers.Cookie ?? "";
  const settings = readSettings(cookieHeader);
  const body = Buffer.isBuffer(request.body)
    ? request.body
    : Buffer.from(request.body ?? "");

  try {
    if (method === "GET" && path === "/api/health") {
      return json({ status: "ok", time: new Date().toISOString() });
    }
    if (method === "GET" && path === "/api/fleet/summary") {
      return json(summaries(settings.thresholdPct));
    }
    if (method === "GET" && path === "/api/config/threshold") {
      return json({ thresholdPct: settings.thresholdPct });
    }
    if (method === "PUT" && path === "/api/config/threshold") {
      if (!url.searchParams.has("value")) {
        return json({
          timestamp: new Date().toISOString(),
          status: 400,
          error: "Bad Request",
          path: "/api/config/threshold"
        }, 400);
      }
      const value = Number(url.searchParams.get("value"));
      validateThreshold(value);
      const next = { ...settings, thresholdPct: value };
      return json({ thresholdPct: value }, 200, { "set-cookie": settingsCookie(next) });
    }
    if (method === "GET" && path === "/api/alerts") {
      return json(alerts(settings.thresholdPct));
    }
    if (method === "POST" && path === "/api/alerts/notify") {
      return json(notify(settings));
    }
    if (method === "GET" && path === "/api/data-quality/summary") {
      return json(dataQuality());
    }
    if (method === "GET" && path === "/api/fuel-consump/export") {
      return text(FUEL_EXPORT, "text/csv", {
        "content-disposition": "attachment; filename=fuel-consump-demo.csv",
        "x-transform-version": "demo-static-v1"
      });
    }
    if (path === "/api/admin/settings" && method === "GET") {
      return json(adminSnapshot(settings));
    }
    if (path === "/api/admin/settings" && method === "PUT") {
      const update = parseJsonBody(body);
      const next = applyPatch(settings, update);
      return json(adminSnapshot(next), 200, { "set-cookie": settingsCookie(next) });
    }
    if (method === "GET" && path === "/api/export/decisions") {
      const filter = parseStatusFilter(url.searchParams.get("status"));
      const computedAt = new Date().toISOString();
      const rows = summaries(settings.thresholdPct)
        .filter((summary) => filter === null || filter.has(summary.status))
        .map((summary) => exportDecision(summary, computedAt));
      if (!isCsv(url.searchParams.get("format"))) return json(rows);
      let csv = csvRow("vesselId", "status", "recommendedAction", "latestSpeedLossPct",
        "thresholdPct", "forecastDaysToThreshold", "activeFuelType", "reviewPriority", "computedAt");
      for (const row of rows) {
        csv += csvRow(row.vesselId, row.status, row.recommendedAction,
          javaDouble(row.latestSpeedLossPct), javaDouble(row.thresholdPct), row.forecastDaysToThreshold,
          row.activeFuelType, row.reviewPriority, row.computedAt);
      }
      return text(csv, "text/csv", {
        "content-disposition": "attachment; filename=\"fleet-decisions.csv\""
      });
    }
    if (method === "GET" && path === "/api/export/alerts") {
      const since = parseSince(url.searchParams.get("since"));
      const generatedAt = new Date().toISOString();
      const rows = since !== null && since > Date.parse(generatedAt)
        ? [] : alerts(settings.thresholdPct);
      if (!isCsv(url.searchParams.get("format"))) return json({ alerts: rows, generatedAt });
      let csv = csvRow("vesselId", "status", "currentSpeedLossPct", "thresholdPct",
        "forecastDaysToThreshold", "recommendedAction", "confidence", "generatedAt");
      for (const row of rows) {
        csv += csvRow(row.vesselId, row.status, javaDouble(row.currentSpeedLossPct),
          javaDouble(row.thresholdPct), row.forecastDaysToThreshold, row.recommendedAction,
          row.confidence, generatedAt);
      }
      return text(csv, "text/csv", {
        "content-disposition": "attachment; filename=fleet-alerts.csv"
      });
    }
    if (method === "POST" && path === "/api/uploads/noon-report") {
      const file = multipartFile(body, headers["content-type"] ?? headers["Content-Type"]);
      if (file === null) return badRequest("Required part 'file' is not present");
      const dryRun = url.searchParams.get("dryRun")?.toLowerCase() !== "false";
      return json(uploadPreview(file, dryRun, settings, VESSEL_IDS));
    }

    const vesselMatch = /^\/api\/vessels\/([^/]+)\/(decision|performance|underwater-events|before-after|ai-brief(?:\/prompt)?)$/.exec(path);
    if (vesselMatch) {
      const vesselId = decodeURIComponent(vesselMatch[1]);
      const resource = vesselMatch[2];
      if (resource === "decision" && method === "GET") {
        return json(decision(vesselId, settings.thresholdPct));
      }
      if (resource === "performance" && method === "GET") {
        return json(performance(vesselId));
      }
      if (resource === "underwater-events" && method === "GET") {
        return json(underwaterEvents(vesselId));
      }
      if (resource === "before-after" && method === "GET") {
        return json(beforeAfter(vesselId, url.searchParams.get("eventId")));
      }
      if (resource === "ai-brief/prompt" && method === "GET") {
        return json(aiBriefPrompt(vesselId, settings.thresholdPct));
      }
      if (resource === "ai-brief" && method === "POST") {
        const forceFallback = url.searchParams.get("forceFallback")?.toLowerCase() === "true";
        return json(aiBrief(vesselId, settings.thresholdPct, forceFallback));
      }
    }
    return notFound();
  } catch (error) {
    if (path.startsWith("/api/vessels/") && error.message.startsWith("unknown vessel:")) {
      return notFound(error.message);
    }
    if (error instanceof SyntaxError) return badRequest("Malformed JSON request");
    return badRequest(error.message);
  }
}
