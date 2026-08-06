import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { createApiServer } from "../lib/node-server.mjs";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testRoot, "..");
const repoRoot = path.resolve(webRoot, "..");
const goldenRoot = path.join(testRoot, "golden");
// PARITY_BASE_URL runs the same suite against a deployed site, so the Vercel entrypoint
// (api/[...path].js) and its routing get covered too, not just the router module.
const remoteBase = process.env.PARITY_BASE_URL?.replace(/\/$/, "");
const server = remoteBase ? null : createApiServer();
if (server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
const baseUrl = remoteBase ?? `http://127.0.0.1:${server.address().port}`;
let cookie = "";
let failures = 0;
const replayed = [];

function multipart(file, filename = "noon.csv") {
  const boundary = "----fleetmind-parity-boundary";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`, "utf8"),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
    ])
  };
}

function assertIso(value, field, name) {
  assert.equal(typeof value, "string", `${name}: ${field} must be a string`);
  assert.ok(!Number.isNaN(Date.parse(value)), `${name}: ${field} must be an ISO instant: ${value}`);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeysDeep(value[k])]));
}

function normalizeEmbeddedPromptJson(prompt, name) {
  const start = prompt.indexOf("{");
  assert.ok(start >= 0, `${name}: userPrompt must embed a JSON document`);
  const prefix = prompt.slice(0, start);
  const parsed = JSON.parse(prompt.slice(start));
  return prefix + JSON.stringify(sortKeysDeep(parsed));
}

function normalizeJson(value, name) {
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item, name));
  if (value === null || typeof value !== "object") return value;
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    if (["time", "generatedAt", "computedAt", "timestamp"].includes(key)) {
      assertIso(item, key, name);
      normalized[key] = `<${key}>`;
    } else if (key === "userPrompt") {
      // AiBriefPrompt embeds a serialized JSON document inside a string. Java builds it
      // from Map.of(), whose iteration order is randomised per JVM run, so the captured
      // golden pins one arbitrary key order while the Node port emits a stable one.
      // Compare the embedded document structurally; the surrounding prose still matters.
      normalized[key] = normalizeEmbeddedPromptJson(item, name);
    } else if (key === "batchId") {
      assert.match(item, /^batch-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        `${name}: invalid batchId`);
      normalized[key] = "<batchId>";
    } else {
      normalized[key] = normalizeJson(item, name);
    }
  }
  return normalized;
}

function normalizeCsv(csv, name) {
  const lines = csv.split("\n");
  if (lines.length === 0) return csv;
  const header = lines[0].split(",");
  const volatileColumns = header
    .map((column, index) => (["generatedAt", "computedAt"].includes(column) ? index : -1))
    .filter((index) => index >= 0);
  if (volatileColumns.length === 0) return csv;
  return lines.map((line, lineIndex) => {
    if (lineIndex === 0 || line === "") return line;
    const cells = line.split(",");
    for (const index of volatileColumns) {
      assertIso(cells[index], header[index], name);
      cells[index] = `<${header[index]}>`;
    }
    return cells.join(",");
  }).join("\n");
}

async function send(url, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return { response, body: await response.text() };
}

async function snap(name, url, options = {}) {
  replayed.push(name);
  const [{ response, body }, goldenBody, goldenStatusText] = await Promise.all([
    send(url, options),
    readFile(path.join(goldenRoot, name), "utf8"),
    readFile(path.join(goldenRoot, `${name}.status`), "utf8")
  ]);
  const expectedStatus = Number(goldenStatusText.trim());
  try {
    assert.equal(response.status, expectedStatus, `${name}: HTTP status`);
    const goldenIsJson = /^[\s]*[\[{]/.test(goldenBody);
    if (goldenIsJson) {
      const actual = normalizeJson(JSON.parse(body), name);
      const expected = normalizeJson(JSON.parse(goldenBody), name);
      assert.deepEqual(actual, expected);
    } else {
      assert.equal(normalizeCsv(body, name), normalizeCsv(goldenBody, name));
    }
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}\n${error.message}`);
    if (/^[\s]*[\[{]/.test(goldenBody)) {
      try {
        console.error("actual:", inspect(normalizeJson(JSON.parse(body), name), { depth: 8, colors: false }));
        console.error("expected:", inspect(normalizeJson(JSON.parse(goldenBody), name), { depth: 8, colors: false }));
      } catch {
        console.error("actual body:", body);
      }
    } else {
      console.error("actual:", normalizeCsv(body, name));
      console.error("expected:", normalizeCsv(goldenBody, name));
    }
  }
}

try {
  await send("/api/config/threshold?value=10", { method: "PUT" });
  await snap("health.json", "/api/health");
  await snap("fleet-summary.json", "/api/fleet/summary");
  await snap("config-threshold.json", "/api/config/threshold");
  await snap("alerts.json", "/api/alerts");
  await snap("data-quality.json", "/api/data-quality/summary");
  await snap("fuel-export.json", "/api/fuel-consump/export");
  await snap("admin-settings.json", "/api/admin/settings");
  await snap("export-decisions.json", "/api/export/decisions");
  await snap("export-decisions.csv", "/api/export/decisions?format=csv");
  await snap("export-decisions-filtered.json", "/api/export/decisions?status=ACT,WATCH");
  await snap("export-alerts.json", "/api/export/alerts");
  await snap("export-alerts.csv", "/api/export/alerts?format=csv");
  await snap("export-alerts-since-future.json", "/api/export/alerts?since=2099-01-01T00:00:00Z");

  for (const vesselId of ["YM-DEMO-01", "YM-DEMO-02", "YM-DEMO-03"]) {
    await snap(`${vesselId}-decision.json`, `/api/vessels/${vesselId}/decision`);
    await snap(`${vesselId}-performance.json`, `/api/vessels/${vesselId}/performance`);
    await snap(`${vesselId}-underwater.json`, `/api/vessels/${vesselId}/underwater-events`);
    await snap(`${vesselId}-before-after.json`, `/api/vessels/${vesselId}/before-after`);
    await snap(`${vesselId}-ai-prompt.json`, `/api/vessels/${vesselId}/ai-brief/prompt`);
    await snap(`${vesselId}-ai-brief-fallback.json`,
      `/api/vessels/${vesselId}/ai-brief?forceFallback=true`, { method: "POST" });
  }

  await send("/api/config/threshold?value=3", { method: "PUT" });
  await snap("t3-fleet-summary.json", "/api/fleet/summary");
  await snap("t3-alerts.json", "/api/alerts");
  await snap("t3-export-alerts.json", "/api/export/alerts");
  await snap("t3-export-alerts.csv", "/api/export/alerts?format=csv");
  await snap("t3-export-decisions.csv", "/api/export/decisions?format=csv");
  await snap("t3-YM-DEMO-01-decision.json", "/api/vessels/YM-DEMO-01/decision");
  await send("/api/config/threshold?value=10", { method: "PUT" });

  // Exact-equality boundaries. DecisionSupport crosses on `speedLoss >= threshold`,
  // so without a case where the two are equal, relaxing >= to > still passes.
  for (const [value, tag] of [
    [4.76, "eq-v1"], [4.761, "just-above-v1"], [4.759, "just-below-v1"],
    [2.1, "eq-v2"], [0.001, "near-zero"], [50, "max-valid"]
  ]) {
    await send(`/api/config/threshold?value=${value}`, { method: "PUT" });
    await snap(`bound-${tag}-fleet-summary.json`, "/api/fleet/summary");
    await snap(`bound-${tag}-alerts.json`, "/api/alerts");
  }
  await send("/api/config/threshold?value=10", { method: "PUT" });

  await snap("err-threshold-zero.json", "/api/config/threshold?value=0", { method: "PUT" });
  await snap("err-threshold-over.json", "/api/config/threshold?value=51", { method: "PUT" });
  await snap("err-threshold-missing.json", "/api/config/threshold", { method: "PUT" });
  await snap("err-unknown-vessel.json", "/api/vessels/NOPE-99/decision");

  const jput = (name, value) => snap(name, "/api/admin/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: value === null ? undefined : JSON.stringify(value)
  });
  await jput("admin-put-partial.json", { alertHorizonDays: 45 });
  await jput("admin-put-channels.json", { channels: ["email", "webhook"], emailRecipients: ["ops@example.com"] });
  await jput("admin-put-threshold.json", { thresholdPct: 6.5 });
  await snap("admin-after-threshold-writethrough.json", "/api/config/threshold");
  await jput("err-admin-bad-channel.json", { channels: ["carrier-pigeon"] });
  await jput("err-admin-bad-email.json", { emailRecipients: ["not-an-email"] });
  await jput("err-admin-bad-arn.json", { snsTopicArn: "nope" });
  await jput("err-admin-bad-horizon.json", { alertHorizonDays: 0 });
  await jput("err-admin-bad-threshold.json", { thresholdPct: 99 });
  await jput("admin-null-body.json", null);
  await jput("admin-restored.json", {
    thresholdPct: 10,
    alertHorizonDays: 30,
    channels: ["sns"],
    emailRecipients: []
  });

  await snap("alerts-notify.json", "/api/alerts/notify", { method: "POST" });

  const sample = await readFile(path.join(repoRoot, "samples", "noon-reports.csv"));
  let form = multipart(sample, "noon-reports.csv");
  await snap("upload-missing-cols.json", "/api/uploads/noon-report?dryRun=true", {
    method: "POST", ...form
  });
  const mixed = Buffer.from(`vessel_id,date,stw_kn,daily_foc_mt,fuel_type,wind_scale
YM-DEMO-01,2025-01-01,14.2,52.4,VLSFO,4
YM-DEMO-02,2025-01-02,13.8,48.1,HFO,3
YM-DEMO-03,2025-01-03,15.1,55.9,MGO,2
NOT-IN-FLEET,2025-01-04,14.0,50.0,VLSFO,3
YM-DEMO-01,2025-01-01,14.2,52.4,VLSFO,4
YM-DEMO-01,not-a-date,abc,,VLSFO,9
`, "utf8");
  form = multipart(mixed);
  await snap("upload-mixed.json", "/api/uploads/noon-report?dryRun=true", { method: "POST", ...form });
  await snap("upload-commit.json", "/api/uploads/noon-report?dryRun=false", { method: "POST", ...form });
  form = multipart(Buffer.alloc(0), "empty.csv");
  await snap("upload-empty.json", "/api/uploads/noon-report?dryRun=true", { method: "POST", ...form });

  const statusFiles = (await readdir(goldenRoot))
    .filter((file) => file.endsWith(".status"))
    .map((file) => file.slice(0, -7))
    .sort();
  assert.deepEqual([...replayed].sort(), statusFiles,
    "parity case list must cover every golden .status file exactly once");

  const priorMetricsFile = process.env.FLEETMIND_METRICS_FILE;
  // Setting the env var only reaches an in-process server; against a remote deployment
  // this degrades to asserting that the served fleet is the synthetic one.
  if (!remoteBase) process.env.FLEETMIND_METRICS_FILE = path.join(repoRoot, "README.md");
  const guardResponse = await fetch(`${baseUrl}/api/fleet/summary`);
  const guardIds = (await guardResponse.json()).map((row) => row.vesselId);
  assert.deepEqual(guardIds, ["YM-DEMO-01", "YM-DEMO-02", "YM-DEMO-03"]);
  if (priorMetricsFile === undefined) delete process.env.FLEETMIND_METRICS_FILE;
  else process.env.FLEETMIND_METRICS_FILE = priorMetricsFile;
  console.log(remoteBase
    ? "PASS demo-only fleet served (remote: env-var guard not exercisable)"
    : "PASS FLEETMIND_METRICS_FILE ignored (demo-only guard)");

  const isolated = await fetch(`${baseUrl}/api/config/threshold`);
  assert.deepEqual(await isolated.json(), { thresholdPct: 10 });
  const oversized = await fetch(`${baseUrl}/api/config/threshold`, {
    headers: { cookie: `fleetmind_settings=${"x".repeat(4097)}` }
  });
  assert.deepEqual(await oversized.json(), { thresholdPct: 10 });
  console.log("PASS visitor isolation and oversized-cookie fallback");
} finally {
  if (server) {
    server.close();
    await once(server, "close");
  }
}

if (failures > 0) {
  console.error(`\nParity FAILED: ${failures}/${replayed.length} cases differed`);
  process.exitCode = 1;
} else {
  console.log(`\nParity PASS: ${replayed.length}/${replayed.length} golden cases`);
}
