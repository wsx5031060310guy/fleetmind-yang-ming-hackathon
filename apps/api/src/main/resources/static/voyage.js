/* FleetMind · /voyage — 一艘船的船體污損偵測與決策旅程
   純 vanilla JS + inline SVG，零外部 CDN。數據全部來自現有 REST API。
   所有動態/AI 文字一律走 textContent（never innerHTML），XSS 安全。
   數字非有限值一律顯示 N/A；無效遙測日（kValue/speedLossPct 為 NaN/null）誠實剔除，不連線。
   prefers-reduced-motion: reduce 時全面退化為靜態最終態。 */

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- primitives ---------- */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svg(tag, attrs, text) {
    const node = document.createElementNS(NS, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fmt(value, decimals) {
    const d = decimals === undefined ? 2 : decimals;
    const n = typeof value === "number" ? value : Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(n)
      ? "N/A" : n.toFixed(d);
  }
  function pctLabel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "N/A";
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function $(sel) { return document.querySelector(sel); }

  async function getJson(path, options, timeoutMs) {
    const t = timeoutMs || 9000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), t);
    try {
      const res = await fetch(path, Object.assign({}, options, { signal: controller.signal }));
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return await res.json();
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("timeout " + t / 1000 + "s");
      throw error;
    } finally { clearTimeout(timer); }
  }

  /* ---------- status vocabulary (identical to dashboard) ---------- */
  function statusClass(s) {
    return s === "ACT" ? "s-act" : s === "WATCH" ? "s-watch" : s === "NORMAL" ? "s-normal" : "s-unknown";
  }
  function statusLabel(s) {
    return s === "ACT" ? "行動 ACT" : s === "WATCH" ? "注意 WATCH" : s === "NORMAL" ? "正常 NORMAL" : "資料不足";
  }
  function actionLabel(a) {
    switch (a) {
      case "RECOMMEND_CLEANING": return "建議安排船體清洗";
      case "SCHEDULE_UWILD": return "建議安排 UWILD 水下檢查";
      case "OBSERVE": return "持續觀察";
      default: return "—";
    }
  }
  function effLabel(e) {
    switch (e) {
      case "FRESH": return "塗層良好";
      case "DIMINISHING": return "效益遞減";
      case "DEPLETED": return "塗層耗弱";
      default: return "N/A";
    }
  }
  function dot(status, extra) { return el("span", "dot " + statusClass(status) + (extra ? " " + extra : "")); }

  /* ---------- number tween (rAF) ---------- */
  function tween(node, to, opts) {
    const o = opts || {};
    const decimals = o.decimals || 0;
    const dur = o.dur || 1100;
    const suffix = o.suffix || "";
    const prefix = o.prefix || "";
    const target = Number(to);
    if (!Number.isFinite(target)) { node.textContent = prefix + "N/A" + suffix; return; }
    if (RM) { node.textContent = prefix + target.toFixed(decimals) + suffix; return; }
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- valid-day filter (honest: null AND NaN excluded) ---------- */
  function validDays(perf, key) {
    return (Array.isArray(perf) ? perf : []).filter((r) =>
      r && /^\d{4}-\d{2}-\d{2}/.test(String(r.date)) &&
      r[key] !== null && r[key] !== undefined && r[key] !== "" && Number.isFinite(Number(r[key])));
  }
  function invalidDays(perf, key) {
    return (Array.isArray(perf) ? perf : []).filter((r) =>
      r && /^\d{4}-\d{2}-\d{2}/.test(String(r.date)) &&
      !(r[key] !== null && r[key] !== undefined && r[key] !== "" && Number.isFinite(Number(r[key]))));
  }
  function decimate(arr, max) {
    if (arr.length <= max) return arr;
    const step = Math.ceil(arr.length / max);
    return arr.filter((_, i) => i % step === 0);
  }
  function timeOf(d) { return Date.parse(String(d) + "T00:00:00Z"); }

  /* ---------- SVG: container-ship side profile with fouling ---------- */
  let uid = 0;
  function shipSVG(foulingRatio) {
    const u = ++uid;
    const clipId = "hclip" + u;
    const s = svg("svg", { viewBox: "0 0 680 300", class: "ship-svg", role: "img", "aria-label": "船側剖視圖" });
    const foul = clamp(Number(foulingRatio) || 0, 0, 1);
    const WL = 188;

    // ----- defs: metal / hull / sea / biofilm gradients -----
    const defs = svg("defs");
    const grFree = svg("linearGradient", { id: "grFree" + u, x1: 0, y1: 0, x2: 0, y2: 1 });
    grFree.append(svg("stop", { offset: "0%", "stop-color": "#f4f9fd" }));
    grFree.append(svg("stop", { offset: "52%", "stop-color": "#d4e4f0" }));
    grFree.append(svg("stop", { offset: "100%", "stop-color": "#a9bccd" }));
    const grHull = svg("linearGradient", { id: "grHull" + u, x1: 0, y1: 0, x2: 0, y2: 1 });
    grHull.append(svg("stop", { offset: "0%", "stop-color": "#123648" }));
    grHull.append(svg("stop", { offset: "100%", "stop-color": "#061520" }));
    const grSea = svg("linearGradient", { id: "grSea" + u, x1: 0, y1: 0, x2: 0, y2: 1 });
    grSea.append(svg("stop", { offset: "0%", "stop-color": "rgba(16,52,72,0.55)" }));
    grSea.append(svg("stop", { offset: "100%", "stop-color": "rgba(4,14,22,0.08)" }));
    const grBio = svg("linearGradient", { id: "grBio" + u, x1: 0, y1: 0, x2: 0, y2: 1 });
    grBio.append(svg("stop", { offset: "0%", "stop-color": "rgba(96,150,86,0.0)" }));
    grBio.append(svg("stop", { offset: "45%", "stop-color": "rgba(84,138,78,0.9)" }));
    grBio.append(svg("stop", { offset: "100%", "stop-color": "rgba(70,58,36,0.85)" }));
    defs.append(grFree, grHull, grSea, grBio);
    s.append(defs);

    // subtle sea band under the waterline
    s.append(svg("rect", { x: 0, y: WL, width: 680, height: 300 - WL, fill: "url(#grSea" + u + ")" }));

    // underwater hull body (graded steel)
    const hull = "M96,150 L600,150 L636,168 L620,196 L560,232 L150,232 L110,206 L96,150 Z";
    s.append(svg("path", { d: hull, fill: "url(#grHull" + u + ")", stroke: "rgba(120,160,190,0.28)", "stroke-width": 1.4 }));
    // bulbous bow hint + hull plating seams
    s.append(svg("path", { d: "M600,150 L636,168 L620,196 Q642,182 636,168 Z", fill: "#0e2a3c", opacity: 0.8 }));
    [164, 178, 200].forEach(function (yy) {
      s.append(svg("line", { x1: 120, y1: yy, x2: 590, y2: yy, stroke: "rgba(150,190,210,0.08)", "stroke-width": 1 }));
    });

    // clip to the underwater hull for fouling + biofilm
    const clip = svg("clipPath", { id: clipId });
    clip.append(svg("path", { d: "M96," + WL + " L636," + WL + " L620,196 L560,232 L150,232 L110,206 L96," + WL + " Z" }));
    s.append(clip);

    // biofilm band clinging just below the waterline — intensity tracks fouling
    s.append(svg("rect", { x: 90, y: WL, width: 560, height: 26, fill: "url(#grBio" + u + ")",
      opacity: 0.22 + foul * 0.55, "clip-path": "url(#" + clipId + ")" }));

    // fouling speckles + growth streaks — density bound to daysSinceLastCleaning ratio (honest)
    const count = Math.round(foul * 90);
    let seed = 20240714;
    const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const g = svg("g", { "clip-path": "url(#" + clipId + ")" });
    for (let i = 0; i < count; i += 1) {
      const x = 110 + rnd() * 500;
      const y = WL + 4 + rnd() * 40;
      const r = 1.6 + rnd() * 4.2;
      const kind = rnd();
      const fill = kind > 0.62 ? "rgba(74,158,96,0.5)" : kind > 0.3 ? "rgba(120,95,55,0.46)" : "rgba(150,182,120,0.34)";
      g.append(svg("ellipse", { cx: x, cy: y, rx: r, ry: r * 0.7, fill: fill }));
      // occasional trailing streak of growth
      if (rnd() > 0.86) g.append(svg("line", { x1: x, y1: y, x2: x + (rnd() - 0.5) * 6, y2: y + 4 + rnd() * 8,
        stroke: "rgba(74,158,96,0.3)", "stroke-width": 1.2, "stroke-linecap": "round" }));
    }
    s.append(g);

    // freeboard (above water) — light graded steel
    s.append(svg("path", { d: "M96,150 L600,150 L636,168 L636," + WL + " L96," + WL + " Z", fill: "url(#grFree" + u + ")", stroke: "rgba(180,205,225,0.55)", "stroke-width": 1 }));
    // accent boot-topping stripe right above the waterline
    s.append(svg("rect", { x: 96, y: WL - 7, width: 540, height: 7, fill: "rgba(47,176,154,0.55)" }));

    // superstructure / bridge (aft-left) with lit windows
    s.append(svg("rect", { x: 116, y: 96, width: 70, height: 54, rx: 3, fill: "#eef5fb" }));
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        s.append(svg("rect", { x: 126 + c * 10, y: 106 + r * 14, width: 7, height: 8, rx: 1,
          fill: (r + c) % 3 === 0 ? "#3FE0C5" : "#9fc0d6", opacity: (r + c) % 3 === 0 ? 0.85 : 0.7 }));
      }
    }
    // funnel with brand band + wisp
    s.append(svg("rect", { x: 150, y: 74, width: 20, height: 24, rx: 2, fill: "#1c4256" }));
    s.append(svg("rect", { x: 150, y: 80, width: 20, height: 5, fill: "#2FB09A" }));
    // mast
    s.append(svg("line", { x1: 205, y1: 150, x2: 205, y2: 112, stroke: "#cde0ee", "stroke-width": 2 }));
    s.append(svg("circle", { cx: 205, cy: 110, r: 2, fill: "#F4A72B" }));

    // container stacks on deck — with top-edge highlight
    const cols = ["#2E8DB0", "#3FE0C5", "#F4A72B", "#4a7fa0", "#2FB09A", "#8fb6cc"];
    let cx = 226;
    while (cx < 590) {
      const stackH = 3 + Math.floor(rnd() * 3);
      for (let r = 0; r < stackH; r += 1) {
        const yy = 150 - 14 * (r + 1);
        s.append(svg("rect", { x: cx, y: yy, width: 34, height: 13, rx: 1.5, fill: cols[(cx + r) % cols.length], opacity: 0.92 }));
        s.append(svg("rect", { x: cx, y: yy, width: 34, height: 2.4, rx: 1, fill: "rgba(255,255,255,0.22)" }));
      }
      cx += 38;
    }

    // waterline — soft glow underlay + crisp dashed line + draft marks
    s.append(svg("line", { x1: 40, y1: WL, x2: 660, y2: WL, stroke: "rgba(63,224,197,0.18)", "stroke-width": 5 }));
    s.append(svg("line", { x1: 40, y1: WL, x2: 660, y2: WL, stroke: "rgba(63,224,197,0.6)", "stroke-width": 1.4, "stroke-dasharray": "7 5" }));
    for (let d = 0; d < 5; d += 1) {
      s.append(svg("line", { x1: 116, y1: WL + 2 + d * 8, x2: 122, y2: WL + 2 + d * 8, stroke: "rgba(215,230,241,0.5)", "stroke-width": 1.4 }));
    }
    s.append(svg("text", { x: 44, y: WL - 6, fill: "rgba(63,224,197,0.85)", "font-size": 11, "font-family": "monospace" }, "吃水線 / waterline"));
    return s;
  }

  /* ---------- SVG: diver silhouette ---------- */
  function diverSVG() {
    const s = svg("svg", { viewBox: "0 0 34 46", role: "img", "aria-label": "潛水員" });
    const gd = svg("radialGradient", { id: "diverGlow" + (++uid) });
    gd.append(svg("stop", { offset: "0%", "stop-color": "rgba(63,224,197,0.42)" }));
    gd.append(svg("stop", { offset: "100%", "stop-color": "rgba(63,224,197,0)" }));
    const gdefs = svg("defs"); gdefs.append(gd); s.append(gdefs);
    s.append(svg("circle", { cx: 17, cy: 23, r: 16, fill: "url(#diverGlow" + uid + ")" }));
    s.append(svg("circle", { cx: 17, cy: 9, r: 6, fill: "#0c3040", stroke: "#3FE0C5", "stroke-width": 1.4 }));
    s.append(svg("rect", { x: 12, y: 4, width: 10, height: 6, rx: 2, fill: "rgba(63,224,197,0.4)" }));
    s.append(svg("path", { d: "M17,15 C11,17 10,26 12,34 L14,44 L20,44 L22,34 C24,26 23,17 17,15 Z", fill: "#0c3040", stroke: "#3FE0C5", "stroke-width": 1.2 }));
    s.append(svg("rect", { x: 22, y: 16, width: 6, height: 16, rx: 3, fill: "#20475c" }));
    s.append(svg("line", { x1: 8, y1: 20, x2: 15, y2: 24, stroke: "#3FE0C5", "stroke-width": 1.4 }));
    return s;
  }

  /* ---------- SVG: event-type icon ---------- */
  function eventIcon(type) {
    const t = String(type || "").toUpperCase();
    const s = svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "#3FE0C5", "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round" });
    if (t.indexOf("DD") >= 0) { // dry dock
      s.append(svg("path", { d: "M3 18h18M5 18V9l7-4 7 4v9" }));
    } else if (t.indexOf("UWC") >= 0) { // cleaning brush
      s.append(svg("path", { d: "M4 20l6-6M14 4l6 6-8 3-1-4-4-1 3-8z" }));
    } else if (t.indexOf("PP") >= 0 && t.indexOf("UWI") < 0) { // propeller polish
      s.append(svg("path", { d: "M12 12l4-6a4 4 0 00-6 2M12 12l-6 4a4 4 0 002 6M12 12l6 4a4 4 0 002-6" }));
      s.append(svg("circle", { cx: 12, cy: 12, r: 1.6, fill: "#3FE0C5", stroke: "none" }));
    } else { // UWI inspection — eye/light
      s.append(svg("path", { d: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" }));
      s.append(svg("circle", { cx: 12, cy: 12, r: 2.4 }));
    }
    return s;
  }
  function eventTypeName(type) {
    const map = { DD: "乾塢", UWC: "水下清洗", UWI: "水下檢查", PP: "螺旋槳打磨" };
    return String(type || "").split("+").map((p) => map[p] || p).join(" + ");
  }

  /* ---------- SVG: wave layers ---------- */
  function seaLayers(host) {
    if (RM) return;
    const wavePath = (amp) =>
      "M0,20 C120," + (20 - amp) + " 240," + (20 + amp) + " 360,20 C480," + (20 - amp) + " 600," + (20 + amp) + " 720,20 L720,60 L0,60 Z";
    [["w1", 8, "rgba(46,141,176,0.5)"], ["w2", 6, "rgba(47,176,154,0.45)"], ["w3", 5, "rgba(63,224,197,0.35)"]].forEach(([cls, amp, col]) => {
      const wrap = el("div", "wave " + cls);
      const s = svg("svg", { viewBox: "0 0 720 60", preserveAspectRatio: "none" });
      s.append(svg("path", { d: wavePath(amp), fill: col }));
      wrap.append(s);
      host.append(wrap);
    });
  }
  function bubbles(host, n) {
    if (RM) return;
    for (let i = 0; i < n; i += 1) {
      const b = el("div", "bubble");
      const size = 4 + Math.random() * 12;
      b.style.width = size + "px";
      b.style.height = size + "px";
      b.style.left = (Math.random() * 100) + "%";
      b.style.animationDuration = (7 + Math.random() * 9) + "s";
      b.style.animationDelay = (-Math.random() * 10) + "s";
      host.append(b);
    }
  }

  /* ---------- ambient depth field: rising marine-snow motes (fixed canvas) ---------- */
  function atmosphere() {
    if (RM) return;
    const canvas = document.createElement("canvas");
    canvas.id = "atmos";
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    document.body.appendChild(canvas);

    // pre-rendered soft glow sprite — one radial gradient, then cheap drawImage per frame
    const SP = 28;
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = SP;
    const sctx = sprite.getContext("2d");
    const sg = sctx.createRadialGradient(SP / 2, SP / 2, 0, SP / 2, SP / 2, SP / 2);
    sg.addColorStop(0, "rgba(168, 246, 232, 0.95)");
    sg.addColorStop(0.35, "rgba(96, 224, 205, 0.4)");
    sg.addColorStop(1, "rgba(63, 224, 197, 0)");
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, SP, SP);

    let W = 0, H = 0, motes = [];
    function spawn(anywhere) {
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : H + 16,
        r: 0.8 + Math.random() * 2.6,
        vy: -(3 + Math.random() * 10) / 60,
        phase: Math.random() * Math.PI * 2,
        sway: 4 + Math.random() * 9,
        a: 0.1 + Math.random() * 0.42
      };
    }
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(clamp(W / 26, 26, 60));
      motes = [];
      for (let i = 0; i < target; i += 1) motes.push(spawn(true));
    }
    let raf = 0, running = false;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < motes.length; i += 1) {
        const m = motes[i];
        m.y += m.vy; m.phase += 0.01;
        if (m.y < -SP) { motes[i] = spawn(false); continue; }
        const x = m.x + Math.sin(m.phase) * m.sway;
        const s = m.r * 3.2;
        ctx.globalAlpha = m.a;
        ctx.drawImage(sprite, x - s, m.y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(frame);
    }
    function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    resize(); start();
  }

  /* ================= data store ================= */
  const store = {
    vesselId: null, summary: null, fleet: [], perf: [],
    events: [], beforeAfter: {}, decision: null, quality: null,
    threshold: 10, briefLoaded: false
  };

  function pickVessel(fleet, wanted) {
    if (!fleet.length) return null;
    if (wanted) { const m = fleet.find((v) => String(v.vesselId) === String(wanted)); if (m) return m.vesselId; }
    const byPri = (a, b) => (a.reviewPriority == null ? 1e9 : a.reviewPriority) - (b.reviewPriority == null ? 1e9 : b.reviewPriority);
    const act = fleet.filter((v) => v.status === "ACT").sort(byPri)[0];
    if (act) return act.vesselId;
    const best = fleet.slice().sort(byPri)[0];
    return best ? best.vesselId : fleet[0].vesselId;
  }

  function co2Factor(fuel) {
    const f = String(fuel || "").toUpperCase();
    if (f.indexOf("MGO") >= 0 || f.indexOf("MDO") >= 0 || f.indexOf("LSMGO") >= 0) return 3.206;
    if (f.indexOf("LNG") >= 0) return 2.750;
    return 3.114; // HFO / VLSFO / default
  }

  /* ================= scene renderers ================= */

  function renderArrival() {
    const sum = store.summary;
    seaLayers($("#arrival-sea"));
    $("#arrival-ship").append(shipSVG(clamp(sum.daysSinceLastCleaning / 730, 0.15, 1)));

    const hud = $("#arrival-hud");
    const wrap = el("div");
    wrap.style.display = "flex"; wrap.style.gap = "16px"; wrap.style.flexWrap = "wrap"; wrap.style.alignItems = "stretch";

    const idCard = el("div", "hud");
    idCard.style.minWidth = "150px";
    idCard.append(el("div", "hud-label", "主角船 / vessel"));
    const nameRow = el("div"); nameRow.style.display = "flex"; nameRow.style.alignItems = "center"; nameRow.style.gap = "10px"; nameRow.style.marginTop = "4px";
    nameRow.append(dot(sum.status, "breathe"), el("div", "hud-value", String(sum.vesselId)));
    idCard.append(nameRow);
    idCard.append(el("div", "hud-sub", "判定信心 " + (sum.confidence || "N/A")));

    const lossCard = el("div", "hud");
    lossCard.style.minWidth = "180px";
    lossCard.append(el("div", "hud-label", "今日 Speed Loss"));
    const lossVal = el("div", "hud-value tnum");
    const num = el("span", "", "0.0"); const unit = el("small", "", "%");
    lossVal.append(num, unit);
    lossCard.append(lossVal);
    const badge = el("span", "badge " + statusClass(sum.status));
    badge.append(dot(sum.status), el("span", "", statusLabel(sum.status)));
    const sub = el("div", "hud-sub"); sub.style.marginTop = "8px"; sub.append(badge);
    lossCard.append(sub);
    tween(num, sum.latestSpeedLossPct, { decimals: 1, dur: 1600 });

    const thCard = el("div", "hud");
    thCard.style.minWidth = "140px";
    const thVal = el("div", "hud-value tnum", pctLabel(sum.thresholdPct));
    thVal.append(el("small", "", "%"));
    thCard.append(el("div", "hud-label", "告警門檻"), thVal, el("div", "hud-sub", "超過即進入 ACT"));

    wrap.append(idCard, lossCard, thCard);
    hud.append(wrap);

    const lead = $("#arrival-lead");
    lead.append(document.createTextNode("這不是行銷動畫。右上角的數字是它今天真實的體檢結果："));
    lead.append((() => { const b = el("span", "hot", fmt(sum.latestSpeedLossPct, 1) + "%"); return b; })());
    lead.append(document.createTextNode(" 的 Speed Loss，遠超 " + pctLabel(sum.thresholdPct) + "% 門檻。旅程，從「這艘船正在悄悄多燒油」這個事實開始。"));
  }

  function renderBerth() {
    const sum = store.summary;
    $("#berth-ship").append(shipSVG(clamp(sum.daysSinceLastCleaning / 730, 0.15, 1)));
    const lead = $("#berth-lead");
    lead.append(document.createTextNode("先不談速度，交代它的病歷背景。距上次船體清洗已 "));
    lead.append((() => el("b", "", fmt(sum.daysSinceLastCleaning, 0) + " 天"))());
    lead.append(document.createTextNode("，累積污損早已超出正常範圍——這解釋了它為什麼會走到今天。"));

    const cards = $("#berth-cards");
    const dq = sum.dataQualityScore;
    const list = [
      ["有效採樣天數", fmt(sum.sampleDays, 0), "個有效 k 值日"],
      ["距上次清洗", fmt(sum.daysSinceLastCleaning, 0), "天"],
      ["進塢後清洗次數", fmt(sum.cleaningsSinceDryDock, 0), "次"],
      ["距上次進塢", sum.daysSinceDryDock == null ? "N/A" : fmt(sum.daysSinceDryDock, 0), sum.daysSinceDryDock == null ? "資料未提供" : "天"],
      ["目前油種", String(sum.activeFuelType || "UNKNOWN"), ""],
      ["資料品質分數", fmt(dq, 0), "／100"]
    ];
    list.forEach(([k, v, sub]) => {
      const c = el("div", "hud");
      c.append(el("div", "hud-label", k));
      const val = el("div", "hud-value tnum"); val.style.fontSize = "clamp(22px,4vw,32px)";
      val.textContent = v;
      if (sub) val.append(el("small", "", " " + sub));
      c.append(val);
      cards.append(c);
    });
  }

  function renderEvents() {
    const events = store.events.slice().sort((a, b) => timeOf(a.date) - timeOf(b.date));
    $("#events-diver").append(diverSVG());
    const lead = $("#events-lead");
    lead.textContent = "這艘船五年間並非放著不管——它做過乾塢、水下檢查、清洗、螺旋槳打磨共 " + events.length + " 次真實維護。維護一直在做，問題卻沒解決。";
    const listHost = $("#events-list");
    events.forEach((ev, i) => {
      const row = el("div", "evt");
      row.dataset.idx = String(i);
      const node = el("div", "evt-node");
      node.append(eventIcon(ev.type));
      const card = el("div", "evt-card");
      card.append(el("div", "evt-date", String(ev.date)));
      card.append(el("div", "evt-type", eventTypeName(ev.type)));
      const ba = store.beforeAfter[ev.eventId];
      const desc = ba && Number.isFinite(Number(ba.recoveryPct))
        ? "效能回復率 " + fmt(ba.recoveryPct, 1) + "%"
        : "型別 " + String(ev.type);
      card.append(el("div", "evt-desc", desc));
      row.append(node, card);
      listHost.append(row);
    });
    if (RM) listHost.querySelectorAll(".evt").forEach((e) => e.classList.add("lit"));
  }

  /* ---- before/after wipe stage ---- */
  function baStageSVG(cleanRatio) {
    // left = fouled, right = clean; a vertical wipe seam at cleanRatio (0..1)
    const u = ++uid;
    const hullPath = "M30,60 L560,60 L580,120 L520,190 L90,190 L20,120 Z";
    const s = svg("svg", { viewBox: "0 0 600 240", preserveAspectRatio: "xMidYMid slice", role: "img", "aria-label": "清洗前後對照" });
    const wipeX = 40 + clamp(cleanRatio, 0, 1) * 520;

    const defs = svg("defs");
    const grBg = svg("linearGradient", { id: "baBg" + u, x1: 0, y1: 0, x2: 0, y2: 1 });
    grBg.append(svg("stop", { offset: "0%", "stop-color": "#08202f" }));
    grBg.append(svg("stop", { offset: "100%", "stop-color": "#040e17" }));
    const grClean = svg("linearGradient", { id: "baClean" + u, x1: 0, y1: 0, x2: 0, y2: 1 });
    grClean.append(svg("stop", { offset: "0%", "stop-color": "rgba(120,240,220,0.22)" }));
    grClean.append(svg("stop", { offset: "100%", "stop-color": "rgba(63,224,197,0.06)" }));
    defs.append(grBg, grClean);
    s.append(defs);

    // deep background + hull
    s.append(svg("rect", { x: 0, y: 0, width: 600, height: 240, fill: "url(#baBg" + u + ")" }));
    s.append(svg("path", { d: hullPath, fill: "#0c2a3c", stroke: "rgba(120,160,190,0.32)", "stroke-width": 1.5 }));

    let seed = 77;
    const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    // fouled side (left of seam): biofilm haze + speckles
    const clip = svg("clipPath", { id: "baclip" + u });
    clip.append(svg("rect", { x: 0, y: 0, width: wipeX, height: 240 }));
    s.append(clip);
    s.append(svg("rect", { x: 0, y: 140, width: 600, height: 50, fill: "rgba(74,120,66,0.35)", "clip-path": "url(#baclip" + u + ")" }));
    const g = svg("g", { "clip-path": "url(#baclip" + u + ")" });
    for (let i = 0; i < 130; i += 1) {
      const kind = rnd();
      g.append(svg("ellipse", { cx: 30 + rnd() * 540, cy: 62 + rnd() * 126, rx: 1.6 + rnd() * 4, ry: 2,
        fill: kind > 0.6 ? "rgba(74,158,96,0.5)" : kind > 0.3 ? "rgba(120,95,55,0.46)" : "rgba(150,182,120,0.32)" }));
    }
    s.append(g);

    // clean side (right of seam): sheen + caustic light streaks + sparkles
    const clip2 = svg("clipPath", { id: "baclip2" + u });
    clip2.append(svg("rect", { x: wipeX, y: 0, width: 600 - wipeX, height: 240 }));
    s.append(clip2);
    s.append(svg("path", { d: hullPath, fill: "url(#baClean" + u + ")", "clip-path": "url(#baclip2" + u + ")" }));
    const cg = svg("g", { "clip-path": "url(#baclip2" + u + ")" });
    [0, 1, 2, 3].forEach(function (k) {
      cg.append(svg("line", { x1: 300 + k * 70, y1: 60, x2: 260 + k * 70, y2: 190,
        stroke: "rgba(160,245,230,0.12)", "stroke-width": 10 }));
    });
    for (let i = 0; i < 10; i += 1) {
      cg.append(svg("circle", { cx: 320 + rnd() * 250, cy: 70 + rnd() * 110, r: 0.8 + rnd() * 1.4, fill: "rgba(200,255,246,0.7)" }));
    }
    s.append(cg);

    // wipe seam — glowing edge + handle
    s.append(svg("line", { x1: wipeX, y1: 20, x2: wipeX, y2: 220, stroke: "rgba(63,224,197,0.25)", "stroke-width": 7 }));
    s.append(svg("line", { x1: wipeX, y1: 20, x2: wipeX, y2: 220, stroke: "#8ff5e6", "stroke-width": 2 }));
    s.append(svg("circle", { cx: wipeX, cy: 120, r: 6, fill: "#06131f", stroke: "#3FE0C5", "stroke-width": 2 }));

    s.append(svg("text", { x: 46, y: 40, fill: "rgba(233,105,78,0.95)", "font-size": 13, "font-family": "monospace" }, "清洗前"));
    s.append(svg("text", { x: 554, y: 40, fill: "rgba(63,224,197,0.95)", "font-size": 13, "font-family": "monospace", "text-anchor": "end" }, "清洗後"));
    return s;
  }

  let recIndex = 0;
  function renderRecovery() {
    const events = store.events.slice().sort((a, b) => timeOf(a.date) - timeOf(b.date));
    if (!events.length) { $("#recovery-lead").textContent = "此船無可比對的養護事件。"; return; }
    // prefer a cleaning (UWC) event as default focus
    const cleaningIdx = events.findIndex((e) => String(e.type).indexOf("UWC") >= 0);
    recIndex = cleaningIdx >= 0 ? cleaningIdx : 0;

    $("#recovery-lead").textContent = "點開一次事件，用真實的 k 值中位數對照清洗前後。殘酷的事實：近期幾次的回復率越來越小、甚至為負，這就是系統標記的「清洗效益遞減 DIMINISHING」。";

    // recovery strip across all events (diminishing story)
    const strip = $("#rev-strip");
    const recs = events.map((e) => {
      const ba = store.beforeAfter[e.eventId];
      return ba && Number.isFinite(Number(ba.recoveryPct)) ? Number(ba.recoveryPct) : null;
    });
    const maxAbs = Math.max(1, ...recs.filter((r) => r != null).map((r) => Math.abs(r)));
    events.forEach((e, i) => {
      const r = recs[i];
      const bar = el("div", "rb " + (r != null && r < 0 ? "neg" : "pos"));
      const h = r == null ? 3 : clamp(Math.abs(r) / maxAbs * 60, 4, 60);
      bar.style.height = h + "px";
      bar.append((() => { const b = el("b"); b.textContent = r == null ? "—" : fmt(r, 0) + "%"; return b; })());
      bar.title = String(e.date) + " · " + eventTypeName(e.type) + " · 回復 " + (r == null ? "N/A" : fmt(r, 1) + "%");
      strip.append(bar);
    });

    $("#rev-prev").addEventListener("click", () => stepRecovery(-1));
    $("#rev-next").addEventListener("click", () => stepRecovery(1));
    paintRecovery();
  }

  function stepRecovery(dir) {
    const n = store.events.length;
    recIndex = (recIndex + dir + n) % n;
    paintRecovery();
  }

  function paintRecovery() {
    const events = store.events.slice().sort((a, b) => timeOf(a.date) - timeOf(b.date));
    const ev = events[recIndex];
    const ba = store.beforeAfter[ev.eventId];
    $("#rev-idx").textContent = (recIndex + 1) + "/" + events.length;
    $("#rev-eventlabel").textContent = String(ev.date) + " · " + eventTypeName(ev.type);

    const stage = $("#recovery-stage");
    stage.replaceChildren(baStageSVG(RM ? 1 : 0.5));

    const kb = ba ? ba.medianKBefore : null;
    const ka = ba ? ba.medianKAfter : null;
    const rec = ba ? ba.recoveryPct : null;
    $("#rev-kbefore").textContent = fmt(kb, 5);
    $("#rev-kafter").textContent = fmt(ka, 5);
    const arrow = $("#rev-arrow");
    if (Number.isFinite(Number(rec))) {
      const down = Number(rec) > 0; // positive recovery = resistance down = good
      arrow.className = "ba-arrow " + (down ? "down" : "up");
      arrow.textContent = (down ? "↓ " : "↑ ") + fmt(rec, 1) + "%";
      arrow.title = down ? "阻力下降，養護有效" : "阻力不降反升，效益為負";
    } else { arrow.className = "ba-arrow"; arrow.textContent = "→"; }

    // physical cost (fuel MT / CO2) — never USD; graceful when businessImpact missing
    const phys = $("#rev-physical");
    phys.replaceChildren();
    const bi = ba && ba.businessImpact;
    const hasPhys = bi && (Number.isFinite(Number(bi.extraFuelMtPerDay)) || Number.isFinite(Number(bi.annualizedCo2MetricTons)));
    if (hasPhys) {
      const row = el("div", "chip-row");
      if (Number.isFinite(Number(bi.extraFuelMtPerDay))) {
        const c = el("div", "chip");
        c.append(el("div", "k", "每日超額燃油"));
        const v = el("div", "v tnum"); v.textContent = fmt(bi.extraFuelMtPerDay, 1); v.append(el("small", "", " MT/日")); c.append(v);
        row.append(c);
      }
      if (Number.isFinite(Number(bi.annualizedCo2MetricTons))) {
        const c = el("div", "chip");
        c.append(el("div", "k", "年化 CO₂"));
        const v = el("div", "v tnum"); v.textContent = fmt(bi.annualizedCo2MetricTons, 0); v.append(el("small", "", " 公噸")); c.append(v);
        row.append(c);
      }
      phys.append(row);
    } else {
      phys.append(el("p", "chart-note", "此事件的每日燃油／CO₂ 明細於資料集中未提供；物理效果改以上方 k 值回復率誠實呈現，不臆造數字。"));
    }
  }

  function renderDeparture() {
    const sum = store.summary;
    seaLayers($("#departure-sea"));
    $("#departure-ship").append(shipSVG(clamp(sum.daysSinceLastCleaning / 730, 0.1, 0.7)));
    // last valid daily FOC baseline
    const validFoc = validDays(store.perf, "dailyFoc");
    const lastFoc = validFoc.length ? validFoc[validFoc.length - 1].dailyFoc : null;
    const hud = $("#departure-hud");
    [["離港油種", String(sum.activeFuelType || "UNKNOWN"), ""],
     ["近期每日油耗基準", fmt(lastFoc, 1), lastFoc == null ? "" : "MT/日"]].forEach(([k, v, sub]) => {
      const c = el("div", "hud");
      c.append(el("div", "hud-label", k));
      const val = el("div", "hud-value tnum"); val.style.fontSize = "clamp(22px,4vw,32px)"; val.textContent = v;
      if (sub) val.append(el("small", "", " " + sub));
      c.append(val);
      hud.append(c);
    });
    $("#departure-lead").textContent = "檢查與清洗結束，船解開纜繩、駛離碼頭回到外海。畫面重新浮出水面——從維護視角，切換到航行中的即時監測視角。";
  }

  /* ---- generic time-series geometry ---- */
  function makeScale(times, values, extra) {
    const xMin = Math.min.apply(null, times), xMax = Math.max.apply(null, times);
    const all = values.slice();
    if (Number.isFinite(extra)) all.push(extra);
    let yMin = Math.min.apply(null, all), yMax = Math.max.apply(null, all);
    const pad = Math.max((yMax - yMin) * 0.12, 0.4);
    yMin -= pad; yMax += pad;
    return { xMin, xMax, yMin, yMax };
  }

  function renderTelemetry() {
    const valid = validDays(store.perf, "kValue");
    const invalid = invalidDays(store.perf, "kValue");
    const total = store.perf.length;
    const lead = $("#telemetry-lead");
    lead.textContent = "每個「滿速有效日」計算一個 k 值（k = 油耗 ÷ 航速立方）。五年約 " + total + " 天裡，只有 " + valid.length + " 天是乾淨可用的——高風、滿速時數不足的日子，會被誠實地過濾掉。";

    const host = $("#telemetry-chart");
    const W = 720, H = 320, m = { t: 22, r: 20, b: 40, l: 56 };
    if (valid.length < 2) { host.append(el("p", "chart-note", "合格樣本不足，暫無遙測折線。")); return; }
    const vSorted = valid.slice().sort((a, b) => timeOf(a.date) - timeOf(b.date));
    const times = vSorted.map((r) => timeOf(r.date));
    const values = vSorted.map((r) => Number(r.kValue));
    const sc = makeScale(times, values);
    const X = (t) => m.l + (t - sc.xMin) / (sc.xMax - sc.xMin || 1) * (W - m.l - m.r);
    const Y = (v) => m.t + (sc.yMax - v) / (sc.yMax - sc.yMin || 1) * (H - m.t - m.b);

    const chart = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "k 值遙測折線" });
    for (let i = 0; i < 4; i += 1) {
      const v = sc.yMin + (sc.yMax - sc.yMin) * i / 3;
      const yy = Y(v);
      chart.append(svg("line", { x1: m.l, y1: yy, x2: W - m.r, y2: yy, stroke: "rgba(148,183,214,0.12)" }));
      chart.append(svg("text", { x: m.l - 8, y: yy + 4, fill: "#7F9CB6", "font-size": 11, "text-anchor": "end", "font-family": "monospace" }, v.toFixed(3)));
    }
    // excluded-day rug (honest: shown but NOT connected to the curve)
    const rugY = H - m.b + 14;
    decimate(invalid.slice().sort((a, b) => timeOf(a.date) - timeOf(b.date)), 90).forEach((r) => {
      const t = timeOf(r.date);
      if (!Number.isFinite(t)) return;
      chart.append(svg("circle", { cx: X(t), cy: rugY, r: 2.6, fill: "none", stroke: "rgba(127,156,182,0.7)", "stroke-width": 1 }));
    });
    chart.append(svg("text", { x: m.l, y: rugY + 16, fill: "#52708b", "font-size": 10, "font-family": "monospace" }, "↑ 被剔除的無效日（灰色空心，未連入曲線）"));

    // valid polyline (scrub-draw) — graded stroke over a static soft-glow underlay
    const pts = vSorted.map((r, i) => X(times[i]) + "," + Y(values[i])).join(" ");
    const tdefs = svg("defs");
    const grTelem = svg("linearGradient", { id: "grTelem", x1: 0, y1: 0, x2: 1, y2: 0 });
    grTelem.append(svg("stop", { offset: "0%", "stop-color": "#2E8DB0" }));
    grTelem.append(svg("stop", { offset: "58%", "stop-color": "#3FE0C5" }));
    grTelem.append(svg("stop", { offset: "100%", "stop-color": "#9af6e6" }));
    tdefs.append(grTelem);
    chart.append(tdefs);
    chart.append(svg("polyline", { points: pts, fill: "none", stroke: "rgba(63,224,197,0.16)", "stroke-width": 7, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const line = svg("polyline", { points: pts, fill: "none", stroke: "url(#grTelem)", "stroke-width": 2.4, "stroke-linejoin": "round", "stroke-linecap": "round", pathLength: 1 });
    line.style.strokeDasharray = "1"; line.style.strokeDashoffset = RM ? "0" : "1";
    chart.append(line);

    // valid dots (decimated)
    const dotG = svg("g");
    decimate(vSorted, 120).forEach((r) => {
      const t = timeOf(r.date); const i = times.indexOf(t);
      const c = svg("circle", { cx: X(t), cy: Y(Number(r.kValue)), r: 3.4, fill: "#3FE0C5", stroke: "#06131f", "stroke-width": 1, "data-xfrac": ((t - sc.xMin) / (sc.xMax - sc.xMin || 1)).toFixed(4) });
      c.style.opacity = RM ? "1" : "0";
      c.append(svg("title", {}, String(r.date) + " · k=" + fmt(r.kValue, 5)));
      dotG.append(c);
    });
    chart.append(dotG);
    // pulsing "latest reading" beacon on the most recent valid k
    const exT = times[times.length - 1], exV = values[values.length - 1];
    const ex = X(exT), ey = Y(exV);
    chart.append(svg("circle", { cx: ex, cy: ey, r: 9, fill: "rgba(63,224,197,0.3)", class: "chart-endpoint-halo" }));
    chart.append(svg("circle", { cx: ex, cy: ey, r: 4, fill: "#eafff9", stroke: "#3FE0C5", "stroke-width": 2 }));
    chart.append(svg("text", { x: m.l, y: H - 6, fill: "#7F9CB6", "font-size": 11, "font-family": "monospace" }, String(vSorted[0].date)));
    chart.append(svg("text", { x: W - m.r, y: H - 6, fill: "#7F9CB6", "font-size": 11, "text-anchor": "end", "font-family": "monospace" }, String(vSorted[vSorted.length - 1].date)));
    host.append(chart);
    host.append(el("p", "chart-note", "青綠實心＝有效 k 值日；灰色空心＝被品質旗標剔除的日子（未連入曲線）。"));

    // store scrub handles
    store._telem = { line: line, dots: dotG };

    // side: data-quality flag counts
    const side = $("#telemetry-side");
    const q = store.quality;
    const box = el("div", "hud");
    const validVal = el("div", "hud-value tnum", String(valid.length));
    validVal.append(el("small", "", " / " + total + " 有效日"));
    box.append(el("div", "hud-label", "資料嚴格清洗佐證"), validVal);
    const ul = el("div"); ul.style.marginTop = "12px"; ul.style.display = "grid"; ul.style.gap = "8px";
    const nameMap = { HIGH_WIND: "強風日", INSUFFICIENT_FULL_SPEED_HOURS: "全速時數不足", INVALID_FULL_SPEED_HOURS: "全速時數無效", MISSING_WIND_SCALE: "缺風級" };
    const fc = (q && q.flagCounts) || {};
    Object.keys(nameMap).forEach((flag) => {
      const row = el("div"); row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.fontSize = "13px";
      row.append(el("span", "", nameMap[flag]));
      row.append((() => { const b = el("b", "tnum"); b.textContent = fmt(fc[flag] || 0, 0); return b; })());
      ul.append(row);
    });
    box.append(ul);
    box.append(el("p", "chart-note", "這是「證據鏈 > 好看曲線」：我們用的是被嚴格清洗過的證據，不是全塞進去的髒資料。"));
    side.append(box);
  }

  /* ---- degradation chart with adjustable threshold ---- */
  let degState = null;
  function renderDegradation() {
    const sum = store.summary;
    const valid = validDays(store.perf, "speedLossPct").slice().sort((a, b) => timeOf(a.date) - timeOf(b.date));
    const lead = $("#degradation-lead");
    lead.textContent = "把有效日的 Speed Loss 沿時間攤成一條上升曲線。以每日 +" + fmt(sum.trendSlopePctPerDay, 3) + "% 的趨勢斜率外推，系統算出距離跨越門檻 " + fmt(sum.forecastDaysToThreshold, 0) + " 天——也就是：現在。";

    const host = $("#degradation-chart");
    const W = 720, H = 340, m = { t: 24, r: 20, b: 40, l: 56 };
    if (valid.length < 2) { host.append(el("p", "chart-note", "合格樣本不足，暫無衰退曲線。")); return; }
    const times = valid.map((r) => timeOf(r.date));
    const values = valid.map((r) => Number(r.speedLossPct));
    const sc = makeScale(times, values, store.threshold);
    const X = (t) => m.l + (t - sc.xMin) / (sc.xMax - sc.xMin || 1) * (W - m.l - m.r);
    const Y = (v) => m.t + (sc.yMax - v) / (sc.yMax - sc.yMin || 1) * (H - m.t - m.b);

    const chart = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Speed Loss 衰退曲線" });
    for (let i = 0; i < 4; i += 1) {
      const v = sc.yMin + (sc.yMax - sc.yMin) * i / 3; const yy = Y(v);
      chart.append(svg("line", { x1: m.l, y1: yy, x2: W - m.r, y2: yy, stroke: "rgba(148,183,214,0.12)" }));
      chart.append(svg("text", { x: m.l - 8, y: yy + 4, fill: "#7F9CB6", "font-size": 11, "text-anchor": "end", "font-family": "monospace" }, v.toFixed(1) + "%"));
    }
    // graded fills + stroke
    const ddefs = svg("defs");
    const grArea = svg("linearGradient", { id: "grDegArea", x1: 0, y1: 0, x2: 0, y2: 1 });
    grArea.append(svg("stop", { offset: "0%", "stop-color": "rgba(63,224,197,0.28)" }));
    grArea.append(svg("stop", { offset: "100%", "stop-color": "rgba(47,176,154,0.02)" }));
    const grDeg = svg("linearGradient", { id: "grDegLine", x1: 0, y1: 0, x2: 1, y2: 0 });
    grDeg.append(svg("stop", { offset: "0%", "stop-color": "#2E8DB0" }));
    grDeg.append(svg("stop", { offset: "72%", "stop-color": "#3FE0C5" }));
    grDeg.append(svg("stop", { offset: "100%", "stop-color": "#F4A72B" }));
    ddefs.append(grArea, grDeg);
    chart.append(ddefs);
    // base area (graded teal)
    const baseline = H - m.b;
    const areaPts = valid.map((r, i) => X(times[i]) + "," + Y(values[i])).join(" ");
    chart.append(svg("polygon", { points: m.l + "," + baseline + " " + areaPts + " " + (W - m.r) + "," + baseline, fill: "url(#grDegArea)" }));
    // static soft-glow underlay the crisp curve lights up over
    chart.append(svg("polyline", { points: areaPts, fill: "none", stroke: "rgba(63,224,197,0.16)", "stroke-width": 7.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    // main curve (scrub-draw)
    const line = svg("polyline", { points: areaPts, fill: "none", stroke: "url(#grDegLine)", "stroke-width": 2.6, "stroke-linejoin": "round", "stroke-linecap": "round", pathLength: 1 });
    line.style.strokeDasharray = "1"; line.style.strokeDashoffset = RM ? "0" : "1";
    chart.append(line);
    // dynamic layer (threshold line, over-threshold overlay, crossing burst)
    const dyn = svg("g");
    chart.append(dyn);

    host.append(chart);
    host.append(el("p", "chart-note", "琥珀虛線＝可調告警門檻；曲線穿越點爆出赤紅焦點＝跨越門檻的那一天。只用有效日，無效日不連線。"));

    degState = { chart: chart, dyn: dyn, X: X, Y: Y, sc: sc, valid: valid, times: times, values: values, W: W, H: H, m: m, line: line };
    paintThresholdLayer();

    // donut
    renderDonut(sum);

    // threshold controls
    setupThresholdControls();
  }

  function paintThresholdLayer() {
    if (!degState) return;
    const st = degState, th = store.threshold;
    st.dyn.replaceChildren();
    // crossing point: first valid day >= threshold
    let crossIdx = -1;
    for (let i = 0; i < st.values.length; i += 1) { if (st.values[i] >= th) { crossIdx = i; break; } }
    // over-threshold overlay: shade the area above the threshold line where curve exceeds it
    if (crossIdx >= 0) {
      const baseY = st.Y(th);
      const seg = [];
      for (let i = crossIdx; i < st.values.length; i += 1) seg.push(st.X(st.times[i]) + "," + st.Y(st.values[i]));
      if (seg.length) {
        const startX = st.X(st.times[crossIdx]);
        const endX = st.X(st.times[st.values.length - 1]);
        st.dyn.append(svg("polygon", { points: startX + "," + baseY + " " + seg.join(" ") + " " + endX + "," + baseY, fill: "rgba(233,105,78,0.22)" }));
      }
    }
    // threshold line (amber dashed)
    if (th >= st.sc.yMin && th <= st.sc.yMax) {
      const ty = st.Y(th);
      st.dyn.append(svg("line", { x1: st.m.l, y1: ty, x2: st.W - st.m.r, y2: ty, stroke: "#F4A72B", "stroke-width": 1.6, "stroke-dasharray": "8 5" }));
      st.dyn.append(svg("text", { x: st.W - st.m.r, y: ty - 7, fill: "#F4A72B", "font-size": 12, "text-anchor": "end", "font-family": "monospace" }, "門檻 " + pctLabel(th) + "%"));
    }
    // crossing burst
    if (crossIdx >= 0) {
      const cx = st.X(st.times[crossIdx]), cy = st.Y(st.values[crossIdx]);
      st.dyn.append(svg("circle", { cx: cx, cy: cy, r: 12, fill: "rgba(233,105,78,0.32)", class: "chart-crossing-halo" }));
      st.dyn.append(svg("circle", { cx: cx, cy: cy, r: 5.5, fill: "#E9694E", stroke: "#fff", "stroke-width": 1.4 }));
      st.dyn.append(svg("text", { x: clamp(cx, st.m.l + 40, st.W - st.m.r - 40), y: cy - 18, fill: "#ffd8cd", "font-size": 12, "text-anchor": "middle", "font-family": "monospace" }, "跨越門檻 · " + String(store.summary.vesselId)));
    }
  }

  function renderDonut(sum) {
    const host = $("#degradation-donut");
    host.replaceChildren();
    const hull = clamp(Number(sum.foulingAttributionPct), 0, 100);
    const hullPct = Number.isFinite(hull) ? hull : 50;
    const propPct = 100 - hullPct;
    const R = 52, C = 2 * Math.PI * R;
    const s = svg("svg", { viewBox: "0 0 140 140", role: "img", "aria-label": "污損歸因" });
    const defs = svg("defs");
    const grD = svg("linearGradient", { id: "grDonut", x1: 0, y1: 0, x2: 1, y2: 1 });
    grD.append(svg("stop", { offset: "0%", "stop-color": "#3FE0C5" }));
    grD.append(svg("stop", { offset: "100%", "stop-color": "#2E8DB0" }));
    defs.append(grD);
    s.append(defs);
    s.append(svg("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: "rgba(47,176,154,0.22)", "stroke-width": 16 }));
    const hullArc = svg("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: "url(#grDonut)", "stroke-width": 16, "stroke-dasharray": (C * hullPct / 100) + " " + C, transform: "rotate(-90 70 70)", "stroke-linecap": "round" });
    s.append(hullArc);
    s.append(svg("text", { x: 70, y: 66, fill: "#eaf4fb", "font-size": 26, "font-weight": "800", "text-anchor": "middle", "font-family": "monospace" }, fmt(hullPct, 0) + "%"));
    s.append(svg("text", { x: 70, y: 84, fill: "#7F9CB6", "font-size": 10, "text-anchor": "middle", "font-family": "monospace", "letter-spacing": "1" }, "船體"));
    host.append(s);
    const cap = el("div", "donut-center");
    cap.append(el("div", "hud-label", "污損歸因"));
    const row = el("div"); row.style.display = "flex"; row.style.gap = "14px"; row.style.justifyContent = "center"; row.style.marginTop = "6px"; row.style.fontSize = "13px";
    row.append((() => { const a = el("span"); a.append((() => { const i = el("i"); i.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:2px;background:#2E8DB0;margin-right:5px"; return i; })(), document.createTextNode("船體 " + fmt(hullPct, 0) + "%")); return a; })());
    row.append((() => { const a = el("span"); a.append((() => { const i = el("i"); i.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(47,176,154,0.35);margin-right:5px"; return i; })(), document.createTextNode("螺旋槳 " + fmt(propPct, 0) + "%")); return a; })());
    cap.append(row);
    host.append(cap);
  }

  /* ---- threshold controls (stepper + presets, PUT shared with dashboard) ---- */
  function setupThresholdControls() {
    const cur = $("#th-cur");
    const presetHost = $("#th-preset");
    presetHost.replaceChildren();
    [6, 8, 10, 12, 15].forEach((p) => {
      const b = el("button", "", pctLabel(p) + "%");
      b.type = "button"; b.dataset.th = String(p);
      b.addEventListener("click", () => applyThreshold(p));
      presetHost.append(b);
    });
    $("#th-dec").addEventListener("click", () => applyThreshold(round1(store.threshold - 0.5)));
    $("#th-inc").addEventListener("click", () => applyThreshold(round1(store.threshold + 0.5)));
    paintThresholdUI();
    cur.textContent = pctLabel(store.threshold) + "%";
  }
  function round1(v) { return Math.round(v * 10) / 10; }
  function paintThresholdUI() {
    const cur = $("#th-cur"); if (cur) cur.textContent = pctLabel(store.threshold) + "%";
    document.querySelectorAll("#th-preset button").forEach((b) => b.classList.toggle("active", Number(b.dataset.th) === Number(store.threshold)));
  }
  async function applyThreshold(value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0 || v > 50) return;
    store.threshold = v;
    paintThresholdUI();
    paintThresholdLayer();
    const status = $("#th-status");
    try {
      const res = await getJson("/api/config/threshold?value=" + encodeURIComponent(v), { method: "PUT" });
      if (res && Number.isFinite(Number(res.thresholdPct))) { store.threshold = Number(res.thresholdPct); paintThresholdUI(); paintThresholdLayer(); }
      status.className = "notify-status ok"; status.textContent = "已同步至決策看板（門檻 " + pctLabel(store.threshold) + "%）";
    } catch (e) {
      status.className = "notify-status err"; status.textContent = "門檻同步失敗：" + (e && e.message ? e.message : "unknown");
    }
  }

  /* ---- decision card + AI brief + alert CTA ---- */
  function renderDecision() {
    const d = store.decision || {};
    const sum = store.summary;
    const host = $("#decision-card");
    const status = d.status || sum.status;

    const head = el("div", "dc-head");
    const v = el("div", "dc-vessel");
    v.append(el("span", "name", String(sum.vesselId)));
    v.append((() => { const t = el("span", "tag"); t.textContent = "使用燃料 " + String(d.activeFuelType || sum.activeFuelType || "UNKNOWN"); return t; })());
    const badge = el("span", "badge " + statusClass(status));
    badge.append(dot(status), el("span", "", statusLabel(status)));
    head.append(v, badge);
    host.append(head);

    // decision cascade
    const cascade = el("div", "dc-cascade");
    const th = Number.isFinite(Number(d.thresholdPct)) ? d.thresholdPct : store.threshold;
    const loss = Number.isFinite(Number(d.currentSpeedLossPct)) ? d.currentSpeedLossPct : sum.latestSpeedLossPct;
    const lines = [];
    lines.push([status, "目前 Speed Loss " + fmt(loss, 1) + "%（門檻 " + pctLabel(th) + "%，判定 " + statusLabel(status) + "）"]);
    if (status === "ACT") lines.push([status, "已達門檻，距跨越 " + fmt(sum.forecastDaysToThreshold, 0) + " 天（外推值）"]);
    lines.push([status, "建議動作：" + actionLabel(d.recommendedAction || sum.recommendedAction)]);
    lines.push([status, "判定信心 " + (d.confidence || sum.confidence || "N/A") + "　·　塗層效果 " + effLabel(sum.cleaningEffectiveness)]);
    lines.forEach(([s, txt], i) => {
      const line = el("div", "dc-line " + (s === "ACT" ? "act" : s === "WATCH" ? "watch" : "normal"));
      line.dataset.i = String(i);
      line.append(dot(s), el("span", "", txt));
      cascade.append(line);
    });
    host.append(cascade);

    if (d.rationale || sum.rationale) host.append((() => { const p = el("p", "dc-rationale"); p.append(el("b", "", "研判："), document.createTextNode(String(d.rationale || sum.rationale))); return p; })());

    // physical cost — fuel MT primary, CO2 as labelled conversion; NO USD
    const cost = el("div", "cost-row");
    const fuelMt = Number.isFinite(Number(sum.estimatedAnnualExcessFuelMt)) ? Number(sum.estimatedAnnualExcessFuelMt) : null;
    const factor = co2Factor(d.activeFuelType || sum.activeFuelType);
    const mkChip = (k, val, sub, metric) => {
      const c = el("div", "chip"); if (metric) c.dataset.cite = metric;
      c.append(el("div", "k", k));
      const vv = el("div", "v tnum"); vv.textContent = val; if (sub) vv.append(el("small", "", " " + sub));
      c.append(vv); return c;
    };
    cost.append(mkChip("多耗燃油率", fmt(sum.fuelPenaltyPct, 1) + "%", "vs 乾淨基準", "fuel_penalty_pct"));
    cost.append(mkChip("預估年度超額燃油", fuelMt == null ? "N/A" : fmt(fuelMt, 0), fuelMt == null ? "" : "公噸 MT", "estimated_annual_excess_fuel_mt"));
    if (fuelMt != null) cost.append(mkChip("換算年度 CO₂", fmt(fuelMt * factor, 0), "公噸（×" + factor + " 係數）"));
    cost.append(mkChip("船體污損占比", fmt(sum.foulingAttributionPct, 0) + "%", "螺旋槳 " + fmt(100 - Number(sum.foulingAttributionPct), 0) + "%"));
    host.append(cost);
    host.append(el("p", "chart-note", "刻意去 ROI：物理代價一律以燃油公噸與 CO₂ 公噸表達，全頁不出現任何金額。"));

    // AI brief box
    const briefBox = el("div", "brief-box");
    const bh = el("div", "brief-head");
    bh.append(el("div", "hud-label", "AI 決策簡報（帶數字守門）"));
    const genBtn = el("button", "btn ghost", "生成 AI 簡報");
    genBtn.type = "button";
    genBtn.addEventListener("click", () => loadBrief(genBtn));
    bh.append(genBtn);
    briefBox.append(bh);
    const briefBody = el("div"); briefBody.id = "brief-body";
    briefBody.append(el("p", "chart-note", "為節省 Bedrock 呼叫，AI 簡報採點擊載入。點上方按鈕生成此船的自然語言決策說明。"));
    briefBox.append(briefBody);
    host.append(briefBox);

    // alert CTA — side-effect, confirm before POST
    const ctaRow = el("div"); ctaRow.style.marginTop = "18px"; ctaRow.style.display = "flex"; ctaRow.style.gap = "12px"; ctaRow.style.flexWrap = "wrap"; ctaRow.style.alignItems = "center";
    const alertBtn = el("button", "btn alert", "寄送告警通知");
    alertBtn.type = "button";
    alertBtn.addEventListener("click", () => sendAlert(alertBtn));
    ctaRow.append(alertBtn);
    ctaRow.append((() => { const s = el("span", "notify-status"); s.id = "alert-status"; return s; })());
    host.append(ctaRow);
    host.append(el("p", "chart-note", "「寄送告警」為副作用動作，會跳確認框後才呼叫 /api/alerts/notify（SNS/Email）；不會因捲動或自動播放觸發。"));
  }

  async function loadBrief(btn) {
    const body = $("#brief-body");
    btn.disabled = true;
    body.replaceChildren(el("p", "chart-note", "生成中…（呼叫 Bedrock，過數字守門）"));
    try {
      const d = await getJson("/api/vessels/" + encodeURIComponent(store.vesselId) + "/ai-brief", { method: "POST" }, 16000);
      renderBrief(body, d);
    } catch (e) {
      body.replaceChildren(el("p", "notify-status err", "AI 簡報暫不可用：" + (e && e.message ? e.message : "unknown")));
    } finally { btn.disabled = false; }
  }

  function renderBrief(host, data) {
    host.replaceChildren();
    const guard = data && data.guardrail;
    if (guard && guard.passed === false) {
      host.append(el("p", "notify-status err", "AI 輸出未通過數字守門，已攔截。"));
      const ul = el("ul");
      (Array.isArray(guard.violations) ? guard.violations : []).forEach((x) => ul.append(el("li", "", String(x))));
      host.append(ul);
      return;
    }
    const meta = el("div", "brief-head");
    const isFallback = data && typeof data.mode === "string" && data.mode.indexOf("fallback") >= 0;
    const modeTag = el("span", "mode-tag" + (isFallback ? " fallback" : ""), data && data.mode ? String(data.mode) : "N/A");
    const when = data && data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "N/A";
    meta.append(modeTag, el("span", "chart-note", "· " + when));
    host.append(meta);

    const p = el("p", "brief-text");
    host.append(p);
    typeBrief(p, String(data && data.briefText || ""));

    const cites = el("div", "brief-cites");
    (Array.isArray(data && data.citedMetrics) ? data.citedMetrics : []).forEach((m) => {
      const pill = el("span", "cite-pill", String(m.metricId) + ": " + String(m.value));
      cites.append(pill);
    });
    host.append(cites);
  }

  // typewriter over plain text, then swap to tokenized [metric] spans
  function typeBrief(node, text) {
    const finalize = () => {
      node.replaceChildren();
      const pattern = /\[([a-z0-9_]+)\]/gi;
      let cursor = 0, match;
      while ((match = pattern.exec(text)) !== null) {
        node.append(document.createTextNode(text.slice(cursor, match.index)));
        const span = el("span", "brief-cite", match[0]);
        span.title = "引用指標：" + match[1];
        node.append(span);
        cursor = pattern.lastIndex;
      }
      node.append(document.createTextNode(text.slice(cursor)));
    };
    if (RM || !text) { finalize(); return; }
    let i = 0;
    const speed = Math.max(8, Math.min(24, Math.floor(2600 / Math.max(1, text.length)) * 4));
    node.textContent = "";
    const timer = setInterval(() => {
      i += 2;
      node.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(timer); finalize(); }
    }, speed);
  }

  async function sendAlert(btn) {
    const status = $("#alert-status");
    const ok = window.confirm("確定要對「目前告警門檻與最新告警快照」發送通知？\n此動作會呼叫 SNS / Email 告警管道，寄給後台設定的收件人。");
    if (!ok) { status.className = "notify-status warn"; status.textContent = "已取消，未寄送。"; return; }
    btn.disabled = true;
    status.className = "notify-status"; status.textContent = "傳送中…";
    try {
      const res = await getJson("/api/alerts/notify", { method: "POST" }, 12000);
      if (res && res.status === "queued") {
        status.className = "notify-status ok";
        status.textContent = "已排入告警佇列（" + fmt(res.alertCount, 0) + " 筆告警，topic 已設定）。";
      } else {
        status.className = "notify-status warn";
        status.textContent = "告警管道未啟用（topicConfigured=false）；請於後台掛上 SNS topic ARN。共 " + fmt(res && res.alertCount, 0) + " 筆待告警。";
      }
    } catch (e) {
      status.className = "notify-status err";
      status.textContent = "寄送失敗：" + (e && e.message ? e.message : "unknown");
    } finally { btn.disabled = false; }
  }

  /* ---- fleet outro ---- */
  function renderOutro() {
    const fleet = store.fleet.slice();
    const counts = { NORMAL: 0, WATCH: 0, ACT: 0 };
    fleet.forEach((v) => { if (counts[v.status] !== undefined) counts[v.status] += 1; });
    $("#outro-lead").textContent = "剛才那趟旅程，在 " + fleet.length + " 艘同型船裡每天都在發生。現況：" + counts.NORMAL + " 艘正常、" + counts.WATCH + " 艘注意、" + counts.ACT + " 艘行動。";

    // scatter map
    const map = $("#outro-map");
    const W = 720, H = 360;
    const s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "艦隊分佈" });
    let seed = 1234;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const color = (st) => st === "ACT" ? "#E9694E" : st === "WATCH" ? "#F4A72B" : "#2FB09A";
    fleet.forEach((vv) => {
      const isSelf = vv.vesselId === store.vesselId;
      const x = 60 + rnd() * (W - 120);
      const y = 50 + rnd() * (H - 100);
      const r = isSelf ? 11 : 7;
      if (isSelf) s.append(svg("circle", { cx: x, cy: y, r: 22, fill: "rgba(63,224,197,0.12)", stroke: "rgba(63,224,197,0.5)", class: "fleet-self-halo" }));
      const c = svg("circle", { cx: x, cy: y, r: r, fill: color(vv.status), stroke: isSelf ? "#fff" : "rgba(6,19,31,0.8)", "stroke-width": isSelf ? 2 : 1, class: "fleet-dot" });
      c.append(svg("title", {}, String(vv.vesselId) + " · " + statusLabel(vv.status) + " · " + fmt(vv.latestSpeedLossPct, 1) + "%"));
      s.append(c);
      if (isSelf) {
        s.append(svg("text", { x: x, y: y - 28, fill: "#3FE0C5", "font-size": 13, "text-anchor": "middle", "font-family": "monospace", "font-weight": "bold" }, String(vv.vesselId) + "（本次主角）"));
      }
    });
    map.append(s);

    // legend
    const legend = $("#outro-legend");
    [["NORMAL", counts.NORMAL, "正常"], ["WATCH", counts.WATCH, "注意"], ["ACT", counts.ACT, "行動"]].forEach(([st, n, name]) => {
      const stat = el("span", "fleet-stat");
      stat.append(dot(st));
      const b = el("b", "tnum"); b.textContent = String(n);
      stat.append(b, el("span", "", name));
      legend.append(stat);
    });

    // mini list sorted by reviewPriority
    const list = $("#outro-list");
    fleet.slice().sort((a, b) => (a.reviewPriority == null ? 1e9 : a.reviewPriority) - (b.reviewPriority == null ? 1e9 : b.reviewPriority))
      .forEach((vv) => {
        const row = el("div", "mini-row" + (vv.vesselId === store.vesselId ? " self" : ""));
        row.append(dot(vv.status), el("span", "ml-id", String(vv.vesselId)));
        row.append((() => { const s2 = el("span", "ml-loss tnum"); s2.textContent = fmt(vv.latestSpeedLossPct, 1) + "%"; return s2; })());
        list.append(row);
      });
  }

  /* ================= scroll engine ================= */
  const SCENES = ["arrival", "berth", "underwater-events", "cleaning-recovery", "departure", "telemetry", "degradation", "decision", "fleet-outro"];
  const SCENE_SHORT = ["入港", "靠泊", "下潛", "對照", "離港", "遙測", "衰退", "決策", "艦隊"];

  function buildNav() {
    const nav = $("#v-nav");
    SCENES.forEach((id, i) => {
      const a = document.createElement("a");
      a.href = "#s-" + (id === "underwater-events" ? "events" : id === "cleaning-recovery" ? "recovery" : id === "fleet-outro" ? "outro" : id);
      a.dataset.scene = id;
      a.append((() => { const s = el("span"); s.textContent = SCENE_SHORT[i]; return s; })());
      nav.append(a);
    });
  }

  function setupReveals() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((n) => {
      if (RM) { n.classList.add("in"); } else { obs.observe(n); }
    });

    // once-per-scene triggers (sail-in ships, decision cascade)
    const once = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const scene = e.target.dataset.scene;
        if (scene === "arrival") $("#arrival-ship").classList.add("in");
        if (scene === "departure") $("#departure-ship").classList.add("in");
        if (scene === "decision") {
          const linesEls = document.querySelectorAll("#decision-card .dc-line");
          linesEls.forEach((ln, i) => { if (RM) ln.classList.add("in"); else setTimeout(() => ln.classList.add("in"), 140 * i); });
        }
        once.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    document.querySelectorAll(".scene").forEach((sc) => {
      if (RM) {
        const scene = sc.dataset.scene;
        if (scene === "arrival") $("#arrival-ship").classList.add("in");
        if (scene === "departure") $("#departure-ship").classList.add("in");
        if (scene === "decision") document.querySelectorAll("#decision-card .dc-line").forEach((ln) => ln.classList.add("in"));
      } else { once.observe(sc); }
    });
  }

  function sceneProgress(section) {
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = section.offsetHeight - vh;
    if (total <= 0) return rect.top <= 0 ? 1 : 0;
    const scrolled = -rect.top;
    return clamp(scrolled / total, 0, 1);
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateProgressBar();
      updateNavActive();
      if (!RM) { updateScrub(); }
      ticking = false;
    });
  }

  function updateProgressBar() {
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const p = docH > 0 ? window.scrollY / docH : 0;
    $("#v-progress").style.width = (p * 100).toFixed(2) + "%";
  }

  function updateNavActive() {
    const vh = window.innerHeight;
    let activeId = SCENES[0];
    document.querySelectorAll(".scene").forEach((sc) => {
      const r = sc.getBoundingClientRect();
      if (r.top <= vh * 0.5 && r.bottom >= vh * 0.5) activeId = sc.dataset.scene;
    });
    document.querySelectorAll("#v-nav a").forEach((a) => a.classList.toggle("active", a.dataset.scene === activeId));
  }

  function updateScrub() {
    // underwater-events diver + node lighting
    const evScene = $("#s-events");
    if (evScene) {
      const p = sceneProgress(evScene);
      const rail = evScene.querySelector(".dive-rail");
      const diver = $("#events-diver");
      if (rail && diver) {
        const h = rail.clientHeight - diver.clientHeight - 8;
        diver.style.top = (clamp(p * 1.05, 0, 1) * Math.max(0, h)) + "px";
      }
      const rows = evScene.querySelectorAll(".evt");
      rows.forEach((row, i) => {
        const frac = rows.length > 1 ? (i + 0.6) / rows.length : 0;
        if (p >= frac) row.classList.add("lit");
      });
    }
    // telemetry path draw + dot reveal
    if (store._telem) {
      const p = sceneProgress($("#s-telemetry"));
      store._telem.line.style.strokeDashoffset = String(1 - p);
      store._telem.dots.querySelectorAll("circle").forEach((c) => {
        const xf = Number(c.getAttribute("data-xfrac"));
        c.style.opacity = p >= xf ? "1" : "0";
      });
    }
    // degradation curve draw
    if (degState) {
      const p = sceneProgress($("#s-degradation"));
      degState.line.style.strokeDashoffset = String(1 - p);
    }
  }

  /* ================= boot ================= */
  function fatal(msg) {
    const host = $("#v-error");
    host.append(el("div", "err-banner", msg));
  }

  async function boot() {
    buildNav();

    let fleet;
    try {
      fleet = await getJson("/api/fleet/summary");
    } catch (e) {
      fatal("無法載入艦隊資料：" + (e && e.message ? e.message : "unknown") + "。請確認 API 服務可用。");
      return;
    }
    store.fleet = Array.isArray(fleet) ? fleet : [];
    const params = new URLSearchParams(location.search);
    const vesselId = pickVessel(store.fleet, params.get("vessel"));
    if (!vesselId) { fatal("艦隊清單為空，無主角船可敘事。"); return; }
    store.vesselId = vesselId;
    store.summary = store.fleet.find((v) => v.vesselId === vesselId) || store.fleet[0];
    if (Number.isFinite(Number(store.summary.thresholdPct))) store.threshold = Number(store.summary.thresholdPct);

    const enc = encodeURIComponent(vesselId);
    const [perf, events, decision, quality, th] = await Promise.allSettled([
      getJson("/api/vessels/" + enc + "/performance"),
      getJson("/api/vessels/" + enc + "/underwater-events"),
      getJson("/api/vessels/" + enc + "/decision"),
      getJson("/api/data-quality/summary"),
      getJson("/api/config/threshold")
    ]);
    store.perf = perf.status === "fulfilled" && Array.isArray(perf.value) ? perf.value : [];
    store.events = events.status === "fulfilled" && Array.isArray(events.value) ? events.value : [];
    store.decision = decision.status === "fulfilled" ? decision.value : null;
    store.quality = quality.status === "fulfilled" ? quality.value : null;
    if (th.status === "fulfilled" && Number.isFinite(Number(th.value.thresholdPct))) store.threshold = Number(th.value.thresholdPct);

    // before-after for all events (cached once)
    const baResults = await Promise.allSettled(
      store.events.map((ev) => getJson("/api/vessels/" + enc + "/before-after?eventId=" + encodeURIComponent(ev.eventId)))
    );
    baResults.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) store.beforeAfter[store.events[i].eventId] = r.value;
    });

    // render every scene
    try { renderArrival(); } catch (e) { /* scene isolation */ }
    try { renderBerth(); } catch (e) {}
    try { renderEvents(); } catch (e) {}
    try { renderRecovery(); } catch (e) {}
    try { renderDeparture(); } catch (e) {}
    try { renderTelemetry(); } catch (e) {}
    try { renderDegradation(); } catch (e) {}
    try { renderDecision(); } catch (e) {}
    try { renderOutro(); } catch (e) {}

    // seed background particles for underwater scene
    bubbles($("#events-bubbles"), 26);
    // ambient depth field behind every scene (skipped under reduced-motion)
    try { atmosphere(); } catch (e) { /* atmosphere is decorative; never block the page */ }

    setupReveals();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // initial paint (also sets scrub to final if RM)
    updateProgressBar();
    updateNavActive();
    if (RM) {
      if (store._telem) { store._telem.line.style.strokeDashoffset = "0"; store._telem.dots.querySelectorAll("circle").forEach((c) => c.style.opacity = "1"); }
      if (degState) degState.line.style.strokeDashoffset = "0";
      document.querySelectorAll(".evt").forEach((e) => e.classList.add("lit"));
    } else {
      updateScrub();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* ================= cinematic photo parallax =================
   Fully isolated, additive layer: its own passive scroll listener + rAF throttle.
   It NEVER touches the data fetch, scene detection, once/scrub judgement or HUD — it only reads
   scene geometry and writes transform on the decorative .scene-photo__img backdrops.
   Under prefers-reduced-motion it bails out entirely, leaving photos as static backgrounds. */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var imgs = Array.prototype.slice.call(document.querySelectorAll(".scene-photo__img"));
  if (!imgs.length) return;
  var AMP = 22;            // px of vertical drift, well inside the 10% image bleed
  var ticking = false;

  function paint() {
    ticking = false;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var scene = img.closest ? img.closest(".scene") : null;
      if (!scene) continue;
      var r = scene.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;          // offscreen: skip work
      var rel = (r.top + r.height / 2 - vh / 2) / vh;          // -1 above centre .. +1 below
      if (rel > 1) rel = 1; else if (rel < -1) rel = -1;
      img.style.transform = "translate3d(0," + (-rel * AMP).toFixed(1) + "px,0)";
    }
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    (window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(paint);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
