/* FleetMind 後台設定 · vanilla JS, zero CDN.
   All dynamic values are written via textContent / createElement (XSS-safe). */
(function () {
  "use strict";

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const ORIGIN = window.location.origin;

  let settings = null;
  let fleetSummary = null;

  const CHANNELS = [
    { key: "email", name: "Email（SNS 訂閱）", desc: "透過 SNS topic 的 email 訂閱送純文字告警。", cfg: "snsConfigured" },
    { key: "sns", name: "SNS Topic", desc: "發佈到 fleetmind-alerts topic，扇出 email／SMS。", cfg: "snsConfigured" },
    { key: "ses", name: "SES（HTML Email）", desc: "品牌化 HTML 告警信，與決策看板同一視覺。", cfg: "sesConfigured" },
    { key: "webhook", name: "通用 Webhook", desc: "對客戶端點 POST 標準化 JSON，帶 HMAC 簽章。", cfg: "webhookConfigured" },
  ];

  const ENDPOINTS = [
    { m: "GET", path: "/api/export/decisions", live: true,
      desc: "一次拉全船隊決策（狀態燈／建議動作／forecast）。?format=json|csv&status=ACT,WATCH",
      curl: 'curl "' + ORIGIN + '/api/export/decisions?format=csv&status=ACT,WATCH"' },
    { m: "GET", path: "/api/export/alerts", live: true,
      desc: "拉出現行告警清單供輪詢。?since=ISO8601&format=json|csv",
      curl: 'curl "' + ORIGIN + '/api/export/alerts?format=json"' },
    { m: "POST", path: "/api/uploads/noon-report", live: true,
      desc: "multipart 上傳 CSV 正午報表，dryRun 預覽逐列驗證。",
      curl: "curl -F file=@noon.csv -F dryRun=true " + ORIGIN + "/api/uploads/noon-report" },
    { m: "POST", path: "/api/alerts/notify", live: true,
      desc: "以現行門檻與最新告警快照，觸發已啟用通道發送一次。",
      curl: "curl -XPOST " + ORIGIN + "/api/alerts/notify" },
    { m: "GET", path: "/api/admin/settings", live: true,
      desc: "讀取目前全部後台設定與各通道設定狀態。",
      curl: "curl " + ORIGIN + "/api/admin/settings" },
    { m: "PUT", path: "/api/admin/settings", live: true,
      desc: "局部更新設定（門檻／通道／收件人／燃料對應…）。",
      curl: "curl -XPUT -H 'Content-Type: application/json' -d '{\"thresholdPct\":12}' " + ORIGIN + "/api/admin/settings" },
    { m: "POST", path: "/api/ingest/noon-reports", live: false,
      desc: "（規劃中）陽明系統批次推入每日正午報表 JSON，upsert 後觸發重算。",
      curl: "# roadmap：system-to-system JSON 進料" },
    { m: "POST", path: "/api/integrations/webhooks", live: false,
      desc: "（規劃中）註冊 outbound webhook 接收端點與 HMAC secret。",
      curl: "# roadmap：註冊接收端點" },
  ];

  function ce(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        if (k === "class") el.className = attrs[k];
        else el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

  function text(node, value) { node.textContent = value; return node; }

  let toastTimer;
  function toast(message, kind) {
    const t = qs("#toast");
    t.textContent = message;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = "toast"; }, 3400);
  }

  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = raw; }
    if (!res.ok) throw new Error((data && data.message) || ("HTTP " + res.status));
    return data;
  }

  // ---------- tabs ----------
  function bindTabs() {
    const tabs = qsa(".tab");
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => selectTab(tab));
      tab.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
          next.focus();
          selectTab(next);
        }
      });
    });
  }
  function selectTab(tab) {
    qsa(".tab").forEach((t) => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
    const target = "panel-" + tab.id.replace("tab-", "");
    qsa(".panel").forEach((p) => p.classList.toggle("active", p.id === target));
  }

  // ---------- load / apply ----------
  async function loadSettings() { settings = await api("GET", "/api/admin/settings"); }
  async function loadFleet() {
    try { fleetSummary = await api("GET", "/api/fleet/summary"); }
    catch (e) { fleetSummary = null; }
  }

  function applySettingsToUI() {
    if (!settings) return;
    qs("#threshold").value = settings.thresholdPct;
    qs("#horizon").value = settings.alertHorizonDays;
    qs("#sns-arn").value = settings.snsTopicArn || "";
    qs("#schedule").value = settings.notifySchedule || "";
    qs("#datasource").value = settings.dataSourceMode || "baked";
    qs("#fuel-default").value = settings.fuelTypeDefault || "";
    renderChannels();
    renderRecipients();
    renderFuel();
  }

  // ---------- threshold ----------
  function bindThreshold() {
    qs("#threshold").addEventListener("input", updateThresholdPreview);
    qs("#save-threshold").addEventListener("click", () => {
      const horizon = parseInt(qs("#horizon").value, 10);
      save({ thresholdPct: parseFloat(qs("#threshold").value), alertHorizonDays: horizon },
        "門檻與決策設定已儲存");
    });
  }
  function updateThresholdPreview() {
    const th = parseFloat(qs("#threshold").value);
    qs("#threshold-out").textContent = th.toFixed(1) + "%";
    const preview = qs("#threshold-preview");
    if (!fleetSummary) { preview.textContent = "無法載入艦隊資料做預覽。"; return; }
    const act = fleetSummary.filter((v) => v.latestSpeedLossPct >= th).length;
    const now = fleetSummary.filter((v) => v.status === "ACT" || v.status === "WATCH").length;
    preview.textContent = "預估：門檻 " + th.toFixed(1) + "% 下約 " + act + " / "
      + fleetSummary.length + " 艘達 ACT（目前伺服器門檻下 " + now + " 艘告警）。";
  }

  // ---------- channels ----------
  function renderChannels() {
    const box = qs("#channels");
    box.textContent = "";
    CHANNELS.forEach((ch) => {
      const enabled = (settings.channels || []).includes(ch.key);
      const configured = !!settings[ch.cfg];
      const label = ce("label", { class: "channel" });
      const input = ce("input", { type: "checkbox" });
      input.checked = enabled;
      input.dataset.key = ch.key;
      const cx = ce("div", { class: "cx" });
      const top = ce("div");
      top.style.display = "flex"; top.style.gap = "8px"; top.style.alignItems = "center";
      const name = ce("b"); text(name, ch.name);
      const pill = ce("span", { class: "pill " + (configured ? "ok" : "muted") });
      pill.append(ce("span", { class: "dot" }), document.createTextNode(configured ? "已設定" : "未設定"));
      top.append(name, pill);
      const desc = ce("span"); text(desc, ch.desc);
      cx.append(top, desc);
      label.append(input, cx);
      box.append(label);
    });
  }

  // ---------- recipients ----------
  function renderRecipients() {
    const box = qs("#recipients");
    box.textContent = "";
    (settings.emailRecipients || []).forEach((r) => box.append(recipientRow(r)));
    if (!(settings.emailRecipients || []).length) box.append(recipientRow(""));
  }
  function recipientRow(value) {
    const row = ce("div", { class: "row-item" });
    const input = ce("input", { type: "email", placeholder: "ops@yangming.com" });
    input.value = value || "";
    const del = ce("button", { class: "icon-btn", type: "button", "aria-label": "刪除收件人" });
    text(del, "×");
    del.addEventListener("click", () => row.remove());
    row.append(input, del);
    return row;
  }

  // ---------- fuel mapping ----------
  function renderFuel() {
    const box = qs("#fuel-rows");
    box.textContent = "";
    const map = settings.fuelTypeMapping || {};
    Object.keys(map).forEach((k) => box.append(fuelRow(k, map[k])));
    if (!Object.keys(map).length) box.append(fuelRow("", ""));
  }
  function fuelRow(rawKey, canonical) {
    const row = ce("div", { class: "row-item" });
    const raw = ce("input", { type: "text", placeholder: "raw 例 LSFO", "data-role": "raw" });
    raw.value = rawKey || "";
    const arrow = ce("span", { class: "arrow" }); text(arrow, "→");
    const can = ce("input", { type: "text", placeholder: "canonical 例 VLSFO", "data-role": "can" });
    can.value = canonical || "";
    const del = ce("button", { class: "icon-btn", type: "button", "aria-label": "刪除對應" });
    text(del, "×");
    del.addEventListener("click", () => row.remove());
    row.append(raw, arrow, can, del);
    return row;
  }

  // ---------- alerts / fuel / datasource actions ----------
  function bindAlerts() {
    qs("#add-recipient").addEventListener("click", () => qs("#recipients").append(recipientRow("")));
    qs("#save-alerts").addEventListener("click", () => {
      const channels = qsa("#channels input:checked").map((i) => i.dataset.key);
      const emailRecipients = qsa("#recipients input").map((i) => i.value.trim()).filter(Boolean);
      const body = { channels, emailRecipients, snsTopicArn: qs("#sns-arn").value.trim() };
      const schedule = qs("#schedule").value.trim();
      if (schedule) body.notifySchedule = schedule;
      save(body, "告警設定已儲存");
    });
    qs("#test-send").addEventListener("click", () => openModal(runTestSend));
  }
  function bindFuel() {
    qs("#add-fuel").addEventListener("click", () => qs("#fuel-rows").append(fuelRow("", "")));
    qs("#save-fuel").addEventListener("click", () => {
      const map = {};
      qsa("#fuel-rows .row-item").forEach((row) => {
        const raw = row.querySelector('[data-role="raw"]').value.trim();
        const can = row.querySelector('[data-role="can"]').value.trim();
        if (raw && can) map[raw] = can;
      });
      const body = { fuelTypeMapping: map };
      const def = qs("#fuel-default").value.trim();
      if (def) body.fuelTypeDefault = def;
      save(body, "燃料對應表已儲存");
    });
  }
  function bindDatasource() {
    qs("#save-datasource").addEventListener("click", () =>
      save({ dataSourceMode: qs("#datasource").value }, "資料來源模式已儲存"));
  }

  async function save(body, okMessage) {
    try {
      settings = await api("PUT", "/api/admin/settings", body);
      applySettingsToUI();
      updateThresholdPreview();
      toast(okMessage, "ok");
    } catch (e) {
      toast("儲存失敗：" + e.message, "err");
    }
  }

  // ---------- test send ----------
  async function runTestSend() {
    try {
      const r = await api("POST", "/api/alerts/notify");
      renderTestResult(r);
      toast("已觸發告警發送（" + r.alertCount + " 筆）", "ok");
    } catch (e) {
      toast("發送失敗：" + e.message, "err");
    }
  }
  function renderTestResult(r) {
    const box = qs("#test-result");
    box.hidden = false;
    box.textContent = "";
    (r.channels || []).forEach((c) => {
      const cls = c.status === "queued" ? "ok" : (c.status === "not_configured" ? "warn" : "muted");
      const pill = ce("span", { class: "pill " + cls });
      pill.append(ce("span", { class: "dot" }),
        document.createTextNode(c.name + "：" + statusLabel(c.status)));
      box.append(pill);
    });
  }
  function statusLabel(status) {
    if (status === "queued") return "已排入發送";
    if (status === "not_configured") return "已啟用但未設定";
    return "未啟用";
  }

  // ---------- modal ----------
  function openModal(onConfirm) {
    const m = qs("#modal");
    m.classList.add("show");
    const confirm = qs("#modal-confirm");
    const cancel = qs("#modal-cancel");
    const close = () => { m.classList.remove("show"); confirm.onclick = null; cancel.onclick = null; m.onclick = null; };
    confirm.onclick = () => { close(); onConfirm(); };
    cancel.onclick = close;
    m.onclick = (e) => { if (e.target === m) close(); };
  }

  // ---------- endpoints ----------
  function renderEndpoints() {
    const box = qs("#endpoints");
    box.textContent = "";
    ENDPOINTS.forEach((ep) => {
      const card = ce("div", { class: "endpoint" });
      const top = ce("div", { class: "top" });
      const method = ce("span", { class: "method " + ep.m.toLowerCase() }); text(method, ep.m);
      const path = ce("code", { class: "path" }); text(path, ep.path);
      const badge = ce("span", { class: ep.live ? "badge-live" : "badge-soon" });
      text(badge, ep.live ? "LIVE" : "規劃中");
      top.append(method, path, badge);
      const desc = ce("p"); text(desc, ep.desc);
      const pre = ce("pre", { class: "curl" }); text(pre, ep.curl);
      card.append(top, desc, pre);
      box.append(card);
    });
  }

  // ---------- upload ----------
  let selectedFile = null;
  function bindUpload() {
    const dz = qs("#dropzone");
    const fi = qs("#file-input");
    dz.addEventListener("click", () => fi.click());
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); }
    });
    fi.addEventListener("change", () => setFile(fi.files[0]));
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); dz.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); dz.classList.remove("dragover");
    }));
    dz.addEventListener("drop", (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
    });
    qs("#do-upload").addEventListener("click", doUpload);
  }
  function setFile(file) {
    selectedFile = file || null;
    qs("#dz-filename").textContent = file
      ? file.name + " · " + (file.size / 1024).toFixed(1) + " KB"
      : "尚未選擇檔案 · 上限 10MB";
    qs("#do-upload").disabled = !file;
  }
  async function doUpload() {
    if (!selectedFile) return;
    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("dryRun", qs("#dry-run").checked ? "true" : "false");
    qs("#do-upload").disabled = true;
    try {
      const res = await fetch("/api/uploads/noon-report", { method: "POST", body: fd });
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
      if (!res.ok) throw new Error((data && data.message) || ("HTTP " + res.status));
      renderUpload(data);
      toast("解析完成", "ok");
    } catch (e) {
      toast("上傳失敗：" + e.message, "err");
    } finally {
      qs("#do-upload").disabled = false;
    }
  }
  function statBox(value, label, kind) {
    const box = ce("div", { class: "stat " + (kind || "") });
    const n = ce("div", { class: "n tnum" }); text(n, String(value));
    const l = ce("div", { class: "l" }); text(l, label);
    box.append(n, l);
    return box;
  }
  function tdText(value) { const td = ce("td"); text(td, value == null ? "—" : String(value)); return td; }
  function renderUpload(r) {
    qs("#upload-result-card").hidden = false;
    const parts = ["批次 " + r.batchId, "模式 " + r.mode, r.message];
    if (r.detectedEncoding) parts.push("編碼 " + r.detectedEncoding);
    qs("#upload-summary").textContent = parts.join(" · ");
    const stats = qs("#upload-stats");
    stats.textContent = "";
    stats.append(
      statBox(r.totalRows, "總列數", ""),
      statBox(r.accepted, "接受", "ok"),
      statBox(r.rejected, "剔除", "act"),
      statBox(r.overwrites, "覆寫(冪等)", "warn")
    );
    const body = qs("#upload-rows");
    body.textContent = "";
    const rows = r.rowErrors || [];
    if (!rows.length) {
      const tr = ce("tr");
      const td = ce("td", { colspan: "5" });
      text(td, r.mode === "rejected" ? "整檔未通過，未產生逐列結果。" : "所有列皆通過，無旗標。");
      tr.append(td);
      body.append(tr);
      return;
    }
    rows.forEach((e) => {
      const tr = ce("tr");
      tr.append(tdText(e.rowIndex), tdText(e.vesselId || "—"), tdText(e.date || "—"));
      const rejected = e.reason !== "ACCEPTED_WITH_FLAGS";
      const resTd = ce("td");
      const pill = ce("span", { class: "pill " + (rejected ? "act" : "warn") });
      pill.append(ce("span", { class: "dot" }),
        document.createTextNode(rejected ? "剔除" : "接受(旗標)"));
      resTd.append(pill);
      tr.append(resTd);
      const flagTd = ce("td");
      (e.qualityFlags || []).forEach((f) => {
        const s = ce("span", { class: "flag" + (rejected ? " reject" : "") });
        text(s, f);
        flagTd.append(s);
      });
      tr.append(flagTd);
      body.append(tr);
    });
  }

  // ---------- init ----------
  async function init() {
    bindTabs();
    bindThreshold();
    bindAlerts();
    bindFuel();
    bindDatasource();
    bindUpload();
    renderEndpoints();
    await Promise.all([loadSettings(), loadFleet()]);
    applySettingsToUI();
    updateThresholdPreview();
  }

  init().catch((e) => toast("初始化失敗：" + e.message, "err"));
})();
