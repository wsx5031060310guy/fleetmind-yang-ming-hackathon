/* FleetMind decision-support dashboard.
   數字來自計算，語言來自 AI，決策留給人。
   All dynamic/AI text goes through textContent or the tokenizing brief renderer
   (never innerHTML) so operator/AI/data strings cannot inject markup. */

const state = {
  vesselId: null,
  threshold: 10,
  fleet: [],
  events: [],
  perf: [],
  requestVersion: 0
};
const NS = "http://www.w3.org/2000/svg";

/* ---------- primitives ---------- */
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

// Percent label: whole numbers stay clean (10%), fractions keep one place (12.5%).
function pctLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function dot(status) {
  return el("span", `dot ${statusClass(status)}`);
}

function errorText(error) {
  return `載入失敗：${error && error.message ? error.message : "unknown"}`;
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
  const host = document.querySelector(selector);
  if (host) host.replaceChildren(el("p", "panel-error", errorText(error)));
}

function skeleton(...nodes) {
  const frag = document.createDocumentFragment();
  nodes.forEach((n) => frag.append(n));
  return frag;
}
function skRows(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) frag.append(el("div", "sk sk-row"));
  return frag;
}

/* ---------- status vocabulary ---------- */
function statusClass(status) {
  switch (status) {
    case "ACT": return "s-act";
    case "WATCH": return "s-watch";
    case "NORMAL": return "s-normal";
    default: return "s-unknown";
  }
}
function statusLabel(status) {
  switch (status) {
    case "ACT": return "行動";
    case "WATCH": return "注意";
    case "NORMAL": return "正常";
    default: return "資料不足";
  }
}
function statusRank(status) {
  switch (status) {
    case "ACT": return 0;
    case "WATCH": return 1;
    case "NORMAL": return 2;
    default: return 3;
  }
}
function actionLabel(action) {
  switch (action) {
    case "RECOMMEND_CLEANING": return "建議安排船體清洗";
    case "SCHEDULE_UWILD": return "建議安排 UWILD 檢查";
    case "OBSERVE": return "持續觀察";
    default: return "—";
  }
}
function effClass(eff) {
  switch (eff) {
    case "FRESH": return "eff-fresh";
    case "DIMINISHING": return "eff-diminishing";
    case "DEPLETED": return "eff-depleted";
    default: return "eff-fresh";
  }
}
function effLabel(eff) {
  switch (eff) {
    case "FRESH": return "塗層良好";
    case "DIMINISHING": return "效果遞減";
    case "DEPLETED": return "塗層耗弱";
    default: return "N/A";
  }
}

// Row may be a fleet summary (latestSpeedLossPct + forecastLowConfidence) or a
// DecisionDto (currentSpeedLossPct + confidence). Normalise the fields we read.
function speedLossOf(row) {
  return row.latestSpeedLossPct !== undefined ? row.latestSpeedLossPct : row.currentSpeedLossPct;
}
function lowConfidenceOf(row) {
  if (typeof row.forecastLowConfidence === "boolean") return row.forecastLowConfidence;
  return row.confidence === "LOW";
}
function forecastText(row) {
  const th = row.thresholdPct != null ? row.thresholdPct : state.threshold;
  if (row.status === "ACT") return `已超過 ${pctLabel(th)}% 門檻`;
  const days = row.forecastDaysToThreshold;
  if (Number.isFinite(Number(days)) && Number(days) > 0) {
    const tail = lowConfidenceOf(row) ? "（低信心）" : "";
    return `預估 ${fmt(days, 0)} 天後將超過 ${pctLabel(th)}% 門檻${tail}`;
  }
  return "短期無跨越門檻預估";
}

/* ---------- threshold control ---------- */
function renderThresholdUI(value) {
  state.threshold = value;
  const label = `${pctLabel(value)}%`;
  const current = document.querySelector("#th-current");
  if (current) current.textContent = label;
  document.querySelectorAll("#th-seg button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.th) === Number(value));
  });
  const input = document.querySelector("#th-input");
  if (input && document.activeElement !== input) input.value = pctLabel(value);
}

async function applyThreshold(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0 || value > 50) {
    renderThresholdUI(state.threshold);
    return;
  }
  renderThresholdUI(value);
  try {
    const result = await getJson(`/api/config/threshold?value=${encodeURIComponent(value)}`, { method: "PUT" });
    if (result && Number.isFinite(Number(result.thresholdPct))) renderThresholdUI(Number(result.thresholdPct));
    document.querySelector("#app-error").textContent = "";
    await refreshDecisionData();
  } catch (error) {
    document.querySelector("#app-error").textContent = `門檻更新失敗：${error.message}`;
  }
}

function bindThreshold() {
  document.querySelectorAll("#th-seg button").forEach((button) => {
    button.addEventListener("click", () => applyThreshold(button.dataset.th));
  });
  const input = document.querySelector("#th-input");
  input.addEventListener("change", () => applyThreshold(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); applyThreshold(input.value); }
  });
}

// Re-pull fleet + alerts after a threshold change and re-render everything that
// depends on the live threshold (statuses, alerts, decision card, chart line).
async function refreshDecisionData() {
  const [fleet, alerts] = await Promise.allSettled([
    getJson("/api/fleet/summary"),
    getJson("/api/alerts")
  ]);
  if (fleet.status === "fulfilled") renderFleet(fleet.value);
  if (alerts.status === "fulfilled") renderAlerts(alerts.value);
  const current = state.fleet.find((row) => row.vesselId === state.vesselId);
  if (current) { renderDecisionCard(current); renderAttribution(current); }
  renderPerformance(state.perf, state.events);
}

/* ---------- decision board (alerts hero) ---------- */
function renderAlerts(list) {
  const host = document.querySelector("#alerts");
  const count = document.querySelector("#board-count");
  const rows = Array.isArray(list) ? list : [];
  if (count) count.textContent = rows.length ? `${rows.length} 艘需關注` : "全部正常";
  if (!rows.length) {
    const empty = el("div", "empty-board");
    empty.append(dot("NORMAL"), el("span", "big-ok", `全船隊目前皆在 ${pctLabel(state.threshold)}% 門檻內，維持例行監測。`));
    host.replaceChildren(empty);
    return;
  }
  const grid = el("div", "alerts-grid");
  rows.forEach((row) => {
    const card = el("article", `alert-card ${statusClass(row.status)}`);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${row.vesselId} ${statusLabel(row.status)}`);

    const top = el("div", "ac-top");
    const vesselWrap = el("div");
    vesselWrap.style.display = "flex";
    vesselWrap.style.alignItems = "center";
    vesselWrap.style.gap = "9px";
    vesselWrap.append(dot(row.status), el("span", "ac-vessel", String(row.vesselId || "—")));
    const badge = el("span", `badge ${statusClass(row.status)}`);
    badge.append(el("span", "", statusLabel(row.status)));
    top.append(vesselWrap, badge);

    const loss = el("div", "ac-loss");
    loss.append(
      el("span", "big", `${fmt(speedLossOf(row), 1)}%`),
      el("span", "vs", `門檻 ${pctLabel(row.thresholdPct)}%`)
    );

    const forecast = el("div", "ac-forecast");
    forecast.append(dot(row.status === "ACT" ? "ACT" : "WATCH"), el("span", "", forecastText(row)));

    const action = el("div", "ac-action");
    action.append(dot(row.status), el("span", "", actionLabel(row.recommendedAction)));

    card.append(top, loss, forecast, action);
    if (row.rationale) card.append(el("p", "ac-rationale", String(row.rationale)));

    const go = () => selectVessel(String(row.vesselId || ""), true);
    card.addEventListener("click", go);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); }
    });
    grid.append(card);
  });
  host.replaceChildren(grid);
}

/* ---------- fleet table ---------- */
function renderFleet(rows) {
  const source = Array.isArray(rows) ? rows.slice() : [];
  source.sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    return Number(speedLossOf(b)) - Number(speedLossOf(a));
  });
  state.fleet = source;
  const title = document.querySelector("#fleet-title");
  if (title) title.textContent = `${source.length} 艘船 · 依風險排序`;
  const tbody = document.querySelector("#fleet tbody");
  if (!source.length) {
    const tr = el("tr");
    const td = el("td", "");
    td.colSpan = 7;
    td.append(el("p", "empty-state", "尚無船隊資料"));
    tr.append(td);
    tbody.replaceChildren(tr);
    return;
  }
  const fragment = document.createDocumentFragment();
  source.forEach((row) => {
    const tr = el("tr");
    tr.dataset.vessel = String(row.vesselId || "");
    tr.dataset.metric = "latest_speed_loss_pct";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-selected", String(row.vesselId === state.vesselId));

    const tdStatus = el("td");
    const status = el("div", "cell-status");
    status.append(dot(row.status), el("span", "lbl", statusLabel(row.status)));
    tdStatus.append(status);

    const tdVessel = el("td", "vessel-cell", String(row.vesselId || "—"));
    const tdLoss = el("td", "num", `${fmt(speedLossOf(row), 1)}%`);

    const forecastCell = row.status === "ACT"
      ? "已超過"
      : (Number.isFinite(Number(row.forecastDaysToThreshold)) && Number(row.forecastDaysToThreshold) > 0
        ? `${fmt(row.forecastDaysToThreshold, 0)} 天` : "—");
    const tdForecast = el("td", "num", forecastCell);

    const tdFouling = el("td", "num", `${fmt(row.foulingAttributionPct, 0)}%`);

    const tdEff = el("td");
    const eff = el("div", `mini-eff ${effClass(row.cleaningEffectiveness)}`);
    const meter = el("div", "eff-meter");
    meter.append(el("i"));
    eff.append(meter, el("span", "", effLabel(row.cleaningEffectiveness)));
    tdEff.append(eff);

    const tdConf = el("td", "", `${row.confidence || "N/A"} · n=${fmt(row.sampleDays, 0)}`);

    tr.append(tdStatus, tdVessel, tdLoss, tdForecast, tdFouling, tdEff, tdConf);

    const select = () => selectVessel(String(row.vesselId || ""));
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
    });
    fragment.append(tr);
  });
  tbody.replaceChildren(fragment);
}

/* ---------- decision card ---------- */
function decisionLine(status, cls, text, metricId) {
  const line = el("div", `dc-line ${cls}`);
  line.append(dot(status));
  const span = el("span", "", text);
  if (metricId) span.dataset.metric = metricId;
  line.append(span);
  return line;
}

function renderDecisionCard(row) {
  const host = document.querySelector("#decision");
  if (!row) { host.replaceChildren(el("p", "empty-state", "選擇一艘船以查看決策細節")); return; }
  host.replaceChildren();

  const head = el("div", "dc-head");
  const vessel = el("div", "dc-vessel");
  vessel.append(el("span", "name", String(row.vesselId || "—")));
  const fuel = el("span", "fuel");
  fuel.append(document.createTextNode("使用燃料 "), (() => {
    const tag = el("span", "dc-fuel-tag", String(row.activeFuelType || "UNKNOWN"));
    return tag;
  })());
  vessel.append(fuel);
  const badge = el("span", `badge ${statusClass(row.status)}`);
  badge.append(dot(row.status), el("span", "", statusLabel(row.status)));
  head.append(vessel, badge);
  host.append(head);

  // gauge: current speed loss vs threshold marker
  const cur = Number(speedLossOf(row));
  const th = Number(row.thresholdPct != null ? row.thresholdPct : state.threshold);
  const domainMax = Math.max(Math.max(cur, 0), th, 4) * 1.3;
  const fillPct = domainMax > 0 ? Math.max(0, Math.min(100, (Math.max(cur, 0) / domainMax) * 100)) : 0;
  const markerPct = domainMax > 0 ? Math.max(0, Math.min(100, (th / domainMax) * 100)) : 0;

  const gauge = el("div", "gauge");
  const gTop = el("div", "gauge-top");
  const gCur = el("div", "gauge-cur");
  gCur.append(
    el("span", "cap", "目前 Speed Loss"),
    el("span", "val", fmt(cur, 1)),
    el("span", "unit", "%")
  );
  gTop.append(gCur, el("span", "gauge-th", `門檻 ${pctLabel(th)}%`));
  const track = el("div", "gauge-track");
  const fill = el("div", `gauge-fill ${statusClass(row.status)}`);
  fill.style.width = `${fillPct}%`;
  const marker = el("div", "gauge-marker");
  marker.style.left = `${markerPct}%`;
  marker.dataset.label = `${pctLabel(th)}%`;
  track.append(fill, marker);
  gauge.append(gTop, track);
  gauge.dataset.metric = "latest_speed_loss_pct";
  host.append(gauge);

  // decision cascade lines
  const lines = el("div", "dc-lines");
  const s = row.status;
  lines.append(decisionLine(s, s === "ACT" ? "act" : s === "WATCH" ? "watch" : "normal",
    `目前 Speed Loss ${fmt(cur, 1)}%（${statusLabel(s)}，門檻 ${pctLabel(th)}%）`));
  lines.append(decisionLine(s === "ACT" ? "ACT" : "WATCH",
    s === "ACT" ? "act" : "watch", forecastText(row)));
  if (row.recommendedAction === "RECOMMEND_CLEANING") {
    lines.append(decisionLine("ACT", "act", "已達門檻：建議先安排 UWILD 水下檢查確認附著情形"));
    lines.append(decisionLine("ACT", "act", "若確認附著物過多，建議安排船體清洗（Hull Cleaning）"));
  } else if (row.recommendedAction === "SCHEDULE_UWILD") {
    lines.append(decisionLine("WATCH", "watch", "建議安排 UWILD 水下檢查（潛水員目視，成本低、非清洗）"));
  } else {
    lines.append(decisionLine("NORMAL", "normal", "持續觀察，維持例行監測即可"));
  }
  host.append(lines);

  if (row.rationale) {
    const rationale = el("p", "dc-rationale");
    rationale.append(el("b", "", "研判："), document.createTextNode(String(row.rationale)));
    host.append(rationale);
  }

  // secondary stats — no dollars, fuel penalty as % + tonnes (粗估)
  const stats = el("div", "dc-stats");
  const addStat = (k, v, sub) => {
    const cell = el("div", "dc-stat");
    cell.append(el("div", "k", k));
    const val = el("div", "v", v);
    if (sub) val.append(el("small", "", ` ${sub}`));
    cell.append(val);
    stats.append(cell);
  };
  addStat("多耗燃油", `${fmt(row.fuelPenaltyPct, 1)}%`, "vs 乾淨基準");
  addStat("船體污損占比", `${fmt(row.foulingAttributionPct, 0)}%`);
  addStat("距上次進塢", `${fmt(row.daysSinceDryDock, 0)}`, "天");
  addStat("清洗次數", `${fmt(row.cleaningsSinceDryDock, 0)}`, "次");
  addStat("塗層效果", effLabel(row.cleaningEffectiveness));
  if (row.estimatedAnnualExcessFuelMt != null && Number.isFinite(Number(row.estimatedAnnualExcessFuelMt))) {
    addStat("年多耗燃油", `${fmt(row.estimatedAnnualExcessFuelMt, 0)}`, "噸・粗估");
  }
  host.append(stats);
}

/* ---------- attribution split bar ---------- */
function renderAttribution(row) {
  const host = document.querySelector("#attribution");
  if (!row) { host.replaceChildren(el("p", "empty-state", "—")); return; }
  const hull = Math.max(0, Math.min(100, Number(row.foulingAttributionPct)));
  const hullValid = Number.isFinite(hull);
  const hullPct = hullValid ? hull : 50;
  const propPct = 100 - hullPct;
  host.replaceChildren();

  const bar = el("div", "attr-bar");
  const hullSeg = el("div", "attr-seg attr-hull", hullPct >= 18 ? `船體 ${fmt(hullPct, 0)}%` : "");
  hullSeg.style.width = `${hullPct}%`;
  const propSeg = el("div", "attr-seg attr-prop", propPct >= 18 ? `螺旋槳 ${fmt(propPct, 0)}%` : "");
  propSeg.style.width = `${propPct}%`;
  bar.append(hullSeg, propSeg);

  const legend = el("div", "attr-legend");
  const mk = (color, text) => {
    const s = el("span");
    const i = el("i"); i.style.background = color;
    s.append(i, el("span", "", text));
    return s;
  };
  legend.append(
    mk("var(--teal)", `船體污損 ${fmt(hullPct, 0)}%`),
    mk("var(--seafoam)", `螺旋槳 ${fmt(propPct, 0)}%`)
  );
  host.append(bar, legend);

  if (!hullValid || row.confidence === "LOW" || Math.round(hullPct) === 50) {
    host.append(el("p", "attr-note", "低信心區間採 50/50 啟發式分配，僅供參考，待 UWILD 確認。"));
  }
}

/* ---------- performance chart ---------- */
function renderPerformance(rows, events) {
  const host = document.querySelector("#performance");
  const data = (Array.isArray(rows) ? rows : []).filter((row) =>
    row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Number(row.speedLossPct)));
  if (data.length < 2) {
    host.replaceChildren(el("p", "empty-state", "合格樣本不足，暫無趨勢（需 ≥ 2 個合格日）"));
    return;
  }
  const width = 760, height = 300, margin = { top: 30, right: 26, bottom: 46, left: 58 };
  const times = data.map((row) => Date.parse(`${row.date}T00:00:00Z`));
  const values = data.map((row) => Number(row.speedLossPct));
  const xMin = Math.min(...times), xMax = Math.max(...times);
  const th = Number(state.threshold);
  const rawMin = Math.min(...values, Number.isFinite(th) ? th : Infinity);
  const rawMax = Math.max(...values, Number.isFinite(th) ? th : -Infinity);
  const pad = Math.max((rawMax - rawMin) * 0.15, 0.5);
  const yMin = rawMin - pad, yMax = rawMax + pad;
  const x = (time) => margin.left + (time - xMin) / (xMax - xMin || 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (yMax - value) / (yMax - yMin || 1) * (height - margin.top - margin.bottom);

  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${state.vesselId} Speed Loss 趨勢` });
  chart.append(svg("title", {}, `${state.vesselId} Speed Loss 趨勢`));

  // gridlines + y labels
  for (let i = 0; i < 4; i += 1) {
    const value = yMin + (yMax - yMin) * i / 3;
    const yy = y(value);
    chart.append(svg("line", { x1: margin.left, y1: yy, x2: width - margin.right, y2: yy, class: "chart-grid" }));
    chart.append(svg("text", { x: margin.left - 9, y: yy + 4, class: "axis-label", "text-anchor": "end" }, `${fmt(value, 1)}%`));
  }

  // threshold line
  if (Number.isFinite(th) && th >= yMin && th <= yMax) {
    const ty = y(th);
    chart.append(svg("line", { x1: margin.left, y1: ty, x2: width - margin.right, y2: ty, class: "threshold-line" }));
    chart.append(svg("text", { x: width - margin.right, y: ty - 6, class: "threshold-text", "text-anchor": "end" }, `門檻 ${pctLabel(th)}%`));
  }

  // underwater event markers
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
    const isLatest = index === data.length - 1;
    const cls = flags.length ? "data-dot flagged" : (isLatest ? "data-dot latest" : "data-dot");
    const dotNode = svg("circle", { id: `dp-${row.date}`, cx: x(times[index]), cy: y(values[index]), r: isLatest ? 6 : 5, class: cls });
    dotNode.dataset.metric = isLatest ? "latest_speed_loss_pct" : "speed_loss_pct";
    dotNode.append(svg("title", {}, flags.length
      ? `${row.date}: ${fmt(row.speedLossPct)}% · ${flags.join(", ")}`
      : `${row.date}: ${fmt(row.speedLossPct)}%`));
    chart.append(dotNode);
  });

  chart.append(svg("text", { x: margin.left, y: height - 14, class: "axis-label" }, data[0].date));
  chart.append(svg("text", { x: width - margin.right, y: height - 14, class: "axis-label", "text-anchor": "end" }, data.at(-1).date));
  const note = el("p", "chart-note", "琥珀點＝最新合格日；空心點＝有品質旗標；紅色虛線＝目前告警門檻；灰色虛線＝水下事件。");
  host.replaceChildren(chart, note);
}

/* ---------- before/after (UWILD/cleaning effect, no dollars) ---------- */
function addMetric(host, label, value, metricId) {
  const item = el("div", "metric");
  if (metricId) item.dataset.metric = metricId;
  item.append(el("span", "", label), el("strong", "", value));
  host.append(item);
}

function renderBeforeAfter(data) {
  const host = document.querySelector("#business");
  if (!data) { host.replaceChildren(el("p", "empty-state", "此船無可比對的養護事件")); return; }
  host.replaceChildren();
  addMetric(host, "養護前 k 值中位數", fmt(data.medianKBefore, 5), "median_k_before");
  addMetric(host, "養護後 k 值中位數", fmt(data.medianKAfter, 5), "median_k_after");
  addMetric(host, "效能回復", `${fmt(data.recoveryPct)}%`, "recovery_pct");
  host.append(el("p", "attr-note", "k = FOC / STW³（同航速正規化）。回復為正＝養護後阻力下降；進塢不保證必然改善，以實測為準。"));
}

/* ---------- citations / jump-back ---------- */
function jumpToMetric(metricId) {
  const safeId = String(metricId || "");
  let target = document.querySelector(`[data-metric="${CSS.escape(safeId)}"]`);
  if (safeId === "latest_speed_loss_pct") {
    target = document.querySelector("#decision .gauge") || target;
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

const BRIEF_TOKEN_SOURCE = "\\[([a-z0-9_]+)\\]";
const briefTokenPattern = () => new RegExp(BRIEF_TOKEN_SOURCE, "gi");

/* Footnote registry. Markers are numbered by order of first appearance in the text —
   the way a report cites — and citedMetrics supplies each one's value and the endpoint
   that produced it. Cited metrics the prose never references are still listed, so the
   sources panel stays a complete account of the numbers behind the brief. */
function buildCitationIndex(text, citedMetrics) {
  const meta = new Map();
  (Array.isArray(citedMetrics) ? citedMetrics : []).forEach((metric) => {
    if (metric && metric.metricId) meta.set(String(metric.metricId), metric);
  });
  const order = [];
  const pattern = briefTokenPattern();
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (!order.includes(match[1])) order.push(match[1]);
  }
  meta.forEach((_metric, metricId) => { if (!order.includes(metricId)) order.push(metricId); });
  return { order, meta };
}

/* A superscript reference marker standing in for the raw [metric_id] token. Keeps
   metricButton's jumpToMetric behaviour, so the number stays traceable by click. */
function citationMarker(metricId, index) {
  const ordinal = index.order.indexOf(metricId) + 1;
  const metric = index.meta.get(metricId);
  const suffix = metric && metric.value !== undefined ? ` = ${metric.value}` : "";
  const button = metricButton(metricId, ordinal > 0 ? String(ordinal) : "?", "cite-marker");
  button.setAttribute("aria-label", `資料來源 ${ordinal}：${metricId}${suffix}`);
  button.title = `${metricId}${suffix} · 點擊跳至來源`;
  const sup = el("sup", "cite-ref");
  sup.append(button);
  return sup;
}

/* Inline text + citation markers. The raw token never reaches the DOM; trailing space
   before a token is dropped so the marker hugs the number it annotates. */
function appendInline(node, text, index) {
  const source = String(text || "");
  const pattern = briefTokenPattern();
  let cursor = 0, match;
  while ((match = pattern.exec(source)) !== null) {
    node.append(document.createTextNode(source.slice(cursor, match.index).replace(/\s+$/, "")));
    node.append(citationMarker(match[1], index));
    cursor = pattern.lastIndex;
  }
  node.append(document.createTextNode(source.slice(cursor)));
}

/* Renders briefText as a report: '#'/'##' become real headings and '・' lines a real
   list (AiBriefPrompt fixes those conventions); the deterministic fallback emits bare
   prose, which falls through to paragraphs. Structure only — every string still lands
   via textContent, so no markup in AI output can execute. */
function appendBriefText(host, text, citedMetrics) {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  const index = buildCitationIndex(source, citedMetrics);
  const body = el("div", "brief-body");
  let list = null, paragraph = null;
  source.split("\n").forEach((raw) => {
    const line = raw.trim();
    // A blank line ends a paragraph but not a list: the model spaces its '・' bullets
    // apart, and those are one list, not one list each.
    if (!line) { paragraph = null; return; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      list = null; paragraph = null;
      const isTitle = heading[1].length === 1;
      const node = el(isTitle ? "h3" : "h4", isTitle ? "brief-title" : "brief-section");
      appendInline(node, heading[2], index);
      body.append(node);
      return;
    }
    const bullet = /^(?:[・·•‧∙]|[-*]\s)\s*(.+)$/.exec(line);
    if (bullet) {
      paragraph = null;
      if (!list) { list = el("ul", "brief-list"); body.append(list); }
      const item = el("li");
      appendInline(item, bullet[1], index);
      list.append(item);
      return;
    }
    list = null;
    if (paragraph) paragraph.append(document.createTextNode(" "));
    else { paragraph = el("p"); body.append(paragraph); }
    appendInline(paragraph, line, index);
  });
  host.append(body);
  return index;
}

/* href is data, not a trusted URL: only same-origin absolute paths become links —
   never javascript: and never protocol-relative //host. */
function isSameOriginPath(href) {
  return typeof href === "string" && /^\/[^/\\]/.test(href);
}

/* The sources panel: each marker above resolves here to its metric id, its value and
   the endpoint that computed it — the traceability the raw tokens used to carry. */
function buildSourceList(index) {
  const section = el("section", "brief-sources");
  if (!index.order.length) return section;
  section.append(el("h4", "brief-sources-title", "資料來源"));
  const list = el("ol", "source-list");
  index.order.forEach((metricId, i) => {
    const metric = index.meta.get(metricId);
    const item = el("li", "source-item");
    item.append(metricButton(metricId, String(i + 1), "cite-marker source-marker"));
    const head = el("div", "source-head");
    head.append(metricButton(metricId, metricId, "citation"));
    if (metric && metric.value !== undefined) head.append(el("span", "source-value", `= ${metric.value}`));
    item.append(head);
    const href = metric && metric.href;
    if (isSameOriginPath(href)) {
      const link = el("a", "source-endpoint", href);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "開啟產生此數字的 API 回應";
      item.append(link);
    } else if (href) {
      item.append(el("span", "source-endpoint", String(href)));
    }
    list.append(item);
  });
  section.append(list);
  return section;
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
  const isFallback = data && typeof data.mode === "string" && data.mode.includes("fallback");
  const meta = el("div", "brief-meta");
  const modeTag = el("span", `mode-tag${isFallback ? " fallback" : ""}`, data && data.mode ? data.mode : "N/A");
  meta.append(modeTag, el("span", "", `· ${generated}`));
  host.append(meta);
  const index = appendBriefText(host, data && data.briefText, data && data.citedMetrics);
  host.append(buildSourceList(index));
}

/* ---------- data quality ---------- */
function renderQuality(data) {
  const descriptions = {
    HIGH_WIND: "強風日",
    INSUFFICIENT_FULL_SPEED_HOURS: "全速時數不足",
    INVALID_FULL_SPEED_HOURS: "全速時數無效",
    MISSING_WIND_SCALE: "缺風級"
  };
  const host = document.querySelector("#quality");
  host.replaceChildren(el("p", "quality-summary", `${fmt(data.exportedRows, 0)} / ${fmt(data.totalRows, 0)} 列已輸出`));
  const list = el("ul", "quality-list");
  Object.entries(descriptions).forEach(([flag, description]) => {
    const count = data.flagCounts && data.flagCounts[flag] !== undefined ? data.flagCounts[flag] : 0;
    const li = el("li");
    const left = el("span", "");
    // 只顯示中文說明。原本並列了 flag 的英文原始碼 (HIGH_WIND 等), 對船務端沒有意義。
    // flag 仍保留在 title 屬性裡, 需要對照原始資料時 hover 得到。
    left.append(document.createTextNode(description));
    left.title = flag;
    li.append(left, el("b", "", fmt(count, 0)));
    list.append(li);
  });
  host.append(list);
}

/* ---------- AI brief loading ---------- */
async function loadBrief(forceFallback, vesselId = state.vesselId, version = state.requestVersion) {
  const host = document.querySelector("#brief");
  const buttons = document.querySelectorAll("#generate, #force-fallback");
  host.replaceChildren(skeleton(el("div", "sk sk-line w80"), el("div", "sk sk-line w60"), el("div", "sk sk-line w40")));
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const suffix = forceFallback ? "?forceFallback=true" : "";
    const data = await getJson(`/api/vessels/${encodeURIComponent(vesselId)}/ai-brief${suffix}`, { method: "POST" }, 15000);
    if (version === state.requestVersion && vesselId === state.vesselId) renderBrief(data);
  } catch (error) {
    if (version === state.requestVersion && vesselId === state.vesselId) {
      host.replaceChildren(el("p", "panel-error", "AI 簡報暫不可用（可改用離線備援）"), el("small", "panel-error", errorText(error)));
    }
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

/* ---------- selection ---------- */
async function selectVessel(vesselId, scrollIntoDetail = false) {
  if (!vesselId) return;
  state.vesselId = vesselId;
  const version = ++state.requestVersion;
  document.querySelector("#selected-vessel").textContent = vesselId;
  document.querySelectorAll("#fleet tbody tr").forEach((rowEl) =>
    rowEl.setAttribute("aria-selected", String(rowEl.dataset.vessel === vesselId)));

  const summaryRow = state.fleet.find((row) => row.vesselId === vesselId);
  renderDecisionCard(summaryRow);
  renderAttribution(summaryRow);
  document.querySelector("#performance").replaceChildren(el("div", "sk sk-chart"));
  document.querySelector("#business").replaceChildren(skRows(3));
  document.querySelector("#brief").replaceChildren(el("p", "empty-state", "點「生成簡報」為此船產生 AI 決策說明"));

  if (scrollIntoDetail) document.querySelector("#decision").scrollIntoView({ behavior: "smooth", block: "start" });

  const encoded = encodeURIComponent(vesselId);
  const [performance, events] = await Promise.allSettled([
    getJson(`/api/vessels/${encoded}/performance`),
    getJson(`/api/vessels/${encoded}/underwater-events`)
  ]);
  if (version !== state.requestVersion) return;
  state.events = events.status === "fulfilled" && Array.isArray(events.value) ? events.value : [];
  state.perf = performance.status === "fulfilled" && Array.isArray(performance.value) ? performance.value : [];
  if (performance.status === "fulfilled") renderPerformance(state.perf, state.events);
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

/* ---------- boot ---------- */
async function boot() {
  bindThreshold();
  document.querySelector("#generate").addEventListener("click", () => loadBrief(false));
  document.querySelector("#force-fallback").addEventListener("click", () => loadBrief(true));

  document.querySelector("#alerts").replaceChildren(el("div", "sk sk-card"));
  document.querySelector("#fleet tbody").replaceChildren((() => {
    const tr = el("tr"); const td = el("td"); td.colSpan = 7; td.append(skRows(6)); tr.append(td); return tr;
  })());

  const [threshold, fleet, alerts, quality] = await Promise.allSettled([
    getJson("/api/config/threshold"),
    getJson("/api/fleet/summary"),
    getJson("/api/alerts"),
    getJson("/api/data-quality/summary")
  ]);

  if (threshold.status === "fulfilled" && Number.isFinite(Number(threshold.value.thresholdPct))) {
    renderThresholdUI(Number(threshold.value.thresholdPct));
  } else {
    renderThresholdUI(state.threshold);
  }

  if (fleet.status === "fulfilled") renderFleet(fleet.value);
  else showError("#fleet-wrap", fleet.reason);
  if (alerts.status === "fulfilled") renderAlerts(alerts.value);
  else document.querySelector("#alerts").replaceChildren(el("p", "panel-error", errorText(alerts.reason)));
  if (quality.status === "fulfilled") renderQuality(quality.value);
  else showError("#quality", quality.reason);

  // Default to the worst-ranked vessel (first row after sort) so the app works on
  // any dataset — demo (YM-DEMO-*) or real (S*) — with no hardcoded id.
  const defaultVessel = state.fleet.length ? String(state.fleet[0].vesselId || "") : null;
  if (defaultVessel) await selectVessel(defaultVessel);
  else renderDecisionCard(null);
}

boot().catch((error) => {
  document.querySelector("#app-error").textContent = errorText(error);
});
