const state = { vesselId: "YM-DEMO-01", fleet: [], events: [], requestVersion: 0 };
const NS = "http://www.w3.org/2000/svg";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmt(value, decimals = 2) {
  const number = typeof value === "number" ? value : Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number)
    ? "N/A" : number.toFixed(decimals);
}

function errorText(error) {
  return `載入失敗: ${error && error.message ? error.message : "unknown"}`;
}

async function getJson(path, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`timeout ${timeoutMs / 1000}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function showError(selector, error) {
  document.querySelector(selector).replaceChildren(el("p", "panel-error", errorText(error)));
}

function renderFleet(rows) {
  state.fleet = Array.isArray(rows) ? rows : [];
  const tbody = document.querySelector("#fleet tbody");
  const fragment = document.createDocumentFragment();
  state.fleet.forEach((row) => {
    const tr = el("tr");
    tr.dataset.vessel = String(row.vesselId || "");
    tr.dataset.metric = "latest_speed_loss_pct";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-selected", String(row.vesselId === state.vesselId));
    const values = [
      row.reviewPriority,
      row.vesselId,
      `${fmt(row.latestSpeedLossPct)}%`,
      `${fmt(row.foulingAttributionPct)}%`,
      `${row.confidence || "N/A"} (n=${fmt(row.sampleDays, 0)})`,
      fmt(row.daysSinceLastCleaning, 0),
      fmt(row.dataQualityScore, 0)
    ];
    values.forEach((value) => tr.append(el("td", "", String(value))));
    const select = () => selectVessel(String(row.vesselId || ""));
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
    });
    fragment.append(tr);
  });
  tbody.replaceChildren(fragment);
}

function renderPerformance(rows, events) {
  const host = document.querySelector("#performance");
  const data = (Array.isArray(rows) ? rows : []).filter((row) =>
    row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Number(row.speedLossPct)));
  if (data.length < 2) {
    host.replaceChildren(el("p", "empty-state", "樣本不足 / no qualified days"));
    return;
  }
  const width = 720, height = 300, margin = { top: 28, right: 24, bottom: 44, left: 58 };
  const times = data.map((row) => Date.parse(`${row.date}T00:00:00Z`));
  const values = data.map((row) => Number(row.speedLossPct));
  const xMin = Math.min(...times), xMax = Math.max(...times);
  const rawMin = Math.min(...values), rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.15, 0.5);
  const yMin = rawMin - pad, yMax = rawMax + pad;
  const x = (time) => margin.left + (time - xMin) / (xMax - xMin) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${state.vesselId} speed loss trend` });
  chart.append(svg("title", {}, `${state.vesselId} Speed Loss 趨勢`));
  for (let i = 0; i < 4; i += 1) {
    const value = yMin + (yMax - yMin) * i / 3;
    const yy = y(value);
    chart.append(svg("line", { x1: margin.left, y1: yy, x2: width - margin.right, y2: yy, class: "chart-grid" }));
    chart.append(svg("text", { x: margin.left - 9, y: yy + 4, class: "axis-label", "text-anchor": "end" }, `${fmt(value, 1)}%`));
  }
  (Array.isArray(events) ? events : []).forEach((event) => {
    const time = Date.parse(`${event.date}T00:00:00Z`);
    if (!Number.isFinite(time) || time < xMin || time > xMax) return;
    const xx = x(time);
    chart.append(svg("line", { x1: xx, y1: margin.top, x2: xx, y2: height - margin.bottom, class: "event-line" }));
    chart.append(svg("text", { x: xx + 4, y: margin.top + 10, class: "event-label" }, String(event.type || "event")));
  });
  const points = data.map((row, index) => `${x(times[index])},${y(values[index])}`).join(" ");
  chart.append(svg("polyline", { points, class: "trend-line" }));
  data.forEach((row, index) => {
    const flags = Array.isArray(row.qualityFlags) ? row.qualityFlags : [];
    const dot = svg("circle", {
      id: `dp-${row.date}`, cx: x(times[index]), cy: y(values[index]), r: 5,
      class: flags.length ? "data-dot flagged" : "data-dot"
    });
    dot.dataset.metric = index === data.length - 1 ? "latest_speed_loss_pct" : "speed_loss_pct";
    dot.append(svg("title", {}, flags.length
      ? `${row.date}: ${fmt(row.speedLossPct)}% · ${flags.join(", ")}`
      : `${row.date}: ${fmt(row.speedLossPct)}%`));
    chart.append(dot);
  });
  chart.append(svg("text", { x: margin.left, y: height - 14, class: "axis-label" }, data[0].date));
  chart.append(svg("text", { x: width - margin.right, y: height - 14, class: "axis-label", "text-anchor": "end" }, data.at(-1).date));
  const note = el("p", "chart-note", "實心點＝合格日；空心點＝品質旗標。虛線＝水下事件。");
  host.replaceChildren(chart, note);
}

function addMetric(host, label, value, metricId) {
  const item = el("div", "metric");
  if (metricId) item.dataset.metric = metricId;
  item.append(el("span", "", label), el("strong", "", value));
  host.append(item);
}

function renderBeforeAfter(data) {
  const host = document.querySelector("#business");
  const impact = data && data.businessImpact ? data.businessImpact : {};
  host.replaceChildren();
  addMetric(host, "Median k before", fmt(data && data.medianKBefore, 5), "median_k_before");
  addMetric(host, "Median k after", fmt(data && data.medianKAfter, 5), "median_k_after");
  addMetric(host, "Recovery", `${fmt(data && data.recoveryPct)}%`, "recovery_pct");
  addMetric(host, "Daily avoidable cost", `$${fmt(impact.dailyAvoidableCostUsd, 0)}`);
  addMetric(host, "Annual fuel cost", `$${fmt(impact.annualizedFuelCostUsd, 0)}`);
  addMetric(host, "Annual CO₂", `${fmt(impact.annualizedCo2MetricTons, 0)} t`);
  addMetric(host, "Daily EU ETS", `$${fmt(impact.dailyEuEtsCostUsd, 0)}`);
  addMetric(host, "Annual EU ETS", `$${fmt(impact.annualizedEuEtsCostUsd, 0)}`);
  addMetric(host, "Payback", `${fmt(impact.paybackDays, 1)} days`, "payback_days");
}

function jumpToMetric(metricId) {
  const safeId = String(metricId || "");
  let target = document.querySelector(`[data-metric="${CSS.escape(safeId)}"]`);
  if (safeId === "latest_speed_loss_pct") {
    target = document.querySelector(`#fleet tr[data-vessel="${CSS.escape(state.vesselId)}"]`) || target;
  }
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("flash");
  requestAnimationFrame(() => target.classList.add("flash"));
  setTimeout(() => target.classList.remove("flash"), 1600);
}

function metricButton(metricId, label, className = "citation") {
  const button = el("button", className, label);
  button.type = "button";
  button.addEventListener("click", () => jumpToMetric(metricId));
  return button;
}

function appendBriefText(host, text) {
  const paragraph = el("p");
  const pattern = /\[([a-z0-9_]+)\]/gi;
  let cursor = 0, match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    paragraph.append(document.createTextNode(String(text).slice(cursor, match.index)));
    paragraph.append(metricButton(match[1], match[0], "inline-citation"));
    cursor = pattern.lastIndex;
  }
  paragraph.append(document.createTextNode(String(text || "").slice(cursor)));
  host.append(paragraph);
}

function renderBrief(data) {
  const host = document.querySelector("#brief");
  host.replaceChildren();
  const guardrail = data && data.guardrail;
  if (guardrail && guardrail.passed === false) {
    host.append(el("p", "guardrail-warning", "AI 輸出未通過數字守門，已攔截"));
    const list = el("ul");
    (Array.isArray(guardrail.violations) ? guardrail.violations : []).forEach((item) => list.append(el("li", "", String(item))));
    host.append(list);
    return;
  }
  const generated = data && data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "N/A";
  host.append(el("div", "brief-meta", `${data && data.mode ? data.mode : "N/A"} · ${generated}`));
  appendBriefText(host, data && data.briefText);
  const citations = el("div", "citations");
  (Array.isArray(data && data.citedMetrics) ? data.citedMetrics : []).forEach((metric) => {
    citations.append(metricButton(metric.metricId, `${metric.metricId}: ${metric.value}`));
  });
  host.append(citations);
}

function renderQuality(data) {
  const descriptions = {
    HIGH_WIND: "強風日",
    INSUFFICIENT_FULL_SPEED_HOURS: "全速時數不足",
    INVALID_FULL_SPEED_HOURS: "全速時數無效",
    MISSING_WIND_SCALE: "缺風級"
  };
  const host = document.querySelector("#quality");
  host.replaceChildren(el("p", "quality-summary", `${fmt(data.exportedRows, 0)}/${fmt(data.totalRows, 0)} rows exported`));
  const list = el("ul", "quality-list");
  Object.entries(descriptions).forEach(([flag, description]) => {
    const count = data.flagCounts && data.flagCounts[flag] !== undefined ? data.flagCounts[flag] : 0;
    list.append(el("li", "", `${flag} → ${fmt(count, 0)} → ${description}`));
  });
  host.append(list);
}

async function loadBrief(forceFallback, vesselId = state.vesselId, version = state.requestVersion) {
  const host = document.querySelector("#brief");
  const buttons = document.querySelectorAll("#generate, #force-fallback");
  host.replaceChildren(el("p", "", "Generating..."));
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const suffix = forceFallback ? "?forceFallback=true" : "";
    const data = await getJson(`/api/vessels/${encodeURIComponent(vesselId)}/ai-brief${suffix}`, { method: "POST" }, 15000);
    if (version === state.requestVersion && vesselId === state.vesselId) renderBrief(data);
  } catch (error) {
    if (version === state.requestVersion && vesselId === state.vesselId) {
      host.replaceChildren(el("p", "panel-error", "AI brief 暫不可用（fallback 可用）"), el("small", "", errorText(error)));
    }
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function selectVessel(vesselId) {
  if (!vesselId) return;
  state.vesselId = vesselId;
  const version = ++state.requestVersion;
  document.querySelector("#selected-vessel").textContent = vesselId;
  document.querySelectorAll("#fleet tbody tr").forEach((row) =>
    row.setAttribute("aria-selected", String(row.dataset.vessel === vesselId)));
  document.querySelector("#performance").replaceChildren(el("p", "", "Loading..."));
  document.querySelector("#business").replaceChildren(el("p", "", "Loading..."));
  document.querySelector("#brief").replaceChildren(el("p", "", "Ready. Generate brief for selected vessel."));
  const encoded = encodeURIComponent(vesselId);
  const [performance, events] = await Promise.allSettled([
    getJson(`/api/vessels/${encoded}/performance`),
    getJson(`/api/vessels/${encoded}/underwater-events`)
  ]);
  if (version !== state.requestVersion) return;
  state.events = events.status === "fulfilled" && Array.isArray(events.value) ? events.value : [];
  if (performance.status === "fulfilled") renderPerformance(performance.value, state.events);
  else showError("#performance", performance.reason);
  const eventId = state.events.length ? state.events[0].eventId : "event-2025-03-cleaning";
  const [beforeAfter] = await Promise.allSettled([
    getJson(`/api/vessels/${encoded}/before-after?eventId=${encodeURIComponent(eventId)}`)
  ]);
  if (version !== state.requestVersion) return;
  if (beforeAfter.status === "fulfilled") renderBeforeAfter(beforeAfter.value);
  else showError("#business", beforeAfter.reason);
  await loadBrief(false, vesselId, version);
}

async function boot() {
  document.querySelector("#generate").addEventListener("click", () => loadBrief(false));
  document.querySelector("#force-fallback").addEventListener("click", () => loadBrief(true));
  const [fleet, quality] = await Promise.allSettled([
    getJson("/api/fleet/summary"),
    getJson("/api/data-quality/summary")
  ]);
  if (fleet.status === "fulfilled") renderFleet(fleet.value);
  else showError("#fleet-wrap", fleet.reason);
  if (quality.status === "fulfilled") renderQuality(quality.value);
  else showError("#quality", quality.reason);
  // Default to the top-priority fleet vessel so the app works on any dataset
  // (demo YM-DEMO-* or real S*), instead of a hardcoded id that may not exist.
  const defaultVessel =
    fleet.status === "fulfilled" && Array.isArray(fleet.value) && fleet.value.length
      ? String(fleet.value[0].vesselId || state.vesselId)
      : state.vesselId;
  await selectVessel(defaultVessel);
}

boot().catch((error) => {
  document.querySelector("#app-error").textContent = errorText(error);
});
