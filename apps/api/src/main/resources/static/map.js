/* FleetMind · 示意艦隊雷達地圖
   船點/狀態來自真 API /api/fleet/summary。雷達座標為「示意」——由 vesselId 決定性哈希
   排布，非真實 GPS。所有動態文字走 textContent（XSS 安全），數字經 fmt() → N/A。 */

(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var CX = 500, CY = 500, R = 430;

  var state = { vessels: [], selected: null };

  /* ---------- primitives ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svg(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, String(attrs[k])); });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fmt(value, decimals) {
    if (decimals === undefined) decimals = 2;
    var number = typeof value === "number" ? value : Number(value);
    return value === null || value === undefined || value === "" || !isFinite(number)
      ? "N/A" : number.toFixed(decimals);
  }

  /* ---------- status vocabulary (mirrors dashboard) ---------- */
  function statusClass(s) {
    return s === "ACT" ? "s-act" : s === "WATCH" ? "s-watch" : s === "NORMAL" ? "s-normal" : "s-unknown";
  }
  function statusLabel(s) {
    return s === "ACT" ? "行動" : s === "WATCH" ? "注意" : s === "NORMAL" ? "正常" : "資料不足";
  }
  function statusRank(s) {
    return s === "ACT" ? 0 : s === "WATCH" ? 1 : s === "NORMAL" ? 2 : 3;
  }
  function effLabel(eff) {
    return eff === "FRESH" ? "塗層良好" : eff === "DIMINISHING" ? "效果遞減"
      : eff === "DEPLETED" ? "塗層耗弱" : "N/A";
  }
  function speedLossOf(row) {
    return row.latestSpeedLossPct !== undefined ? row.latestSpeedLossPct : row.currentSpeedLossPct;
  }
  function forecastText(row) {
    if (row.status === "ACT") return "已超過門檻";
    var d = Number(row.forecastDaysToThreshold);
    return isFinite(d) && d > 0 ? fmt(d, 0) + " 天" : "—";
  }

  /* ---------- deterministic (non-GPS) placement ---------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function placeOf(id) {
    var a = (hash(id) % 3600) / 3600 * Math.PI * 2;
    var rr = (0.34 + (hash(id + "~r") % 1000) / 1000 * 0.56) * R;
    return { x: CX + rr * Math.cos(a), y: CY + rr * Math.sin(a) };
  }

  /* ---------- radar scaffold (static, drawn once) ---------- */
  function buildRadar() {
    var root = svg("svg", {
      viewBox: "0 0 1000 1000", class: "radar-svg",
      preserveAspectRatio: "xMidYMid meet", role: "img",
      "aria-label": "艦隊示意雷達，船點依風險狀態著色"
    });
    root.appendChild(svg("title", {}, "FleetMind 示意艦隊雷達"));

    var grid = svg("g", { "aria-hidden": "true" });
    // range rings
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      grid.appendChild(svg("circle", {
        cx: CX, cy: CY, r: R * f, class: "r-ring" + (f === 1 ? " edge" : "")
      }));
    });
    // cross axes
    grid.appendChild(svg("line", { x1: CX - R, y1: CY, x2: CX + R, y2: CY, class: "r-axis" }));
    grid.appendChild(svg("line", { x1: CX, y1: CY - R, x2: CX, y2: CY + R, class: "r-axis" }));
    // illustrative shipping lanes (curved dashed) — purely decorative
    grid.appendChild(svg("path", { d: "M120 640 C 360 520, 640 560, 900 380", class: "r-lane" }));
    grid.appendChild(svg("path", { d: "M180 300 C 420 460, 620 440, 860 700", class: "r-lane" }));
    // bearing ticks
    [["N", CX, CY - R + 26], ["E", CX + R - 26, CY + 5], ["S", CX, CY + R - 14], ["W", CX - R + 14, CY + 5]]
      .forEach(function (t) {
        grid.appendChild(svg("text", { x: t[1], y: t[2], class: "r-tick", "text-anchor": "middle" }, t[0]));
      });
    root.appendChild(grid);

    var ships = svg("g", { class: "ship-layer" });
    root.appendChild(ships);
    return { root: root, ships: ships };
  }

  /* ---------- ship points ---------- */
  function drawShips(layer) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    state.vessels.forEach(function (row) {
      var id = String(row.vesselId || "—");
      var p = placeOf(id);
      var cls = statusClass(row.status);
      var g = svg("g", {
        class: "ship " + cls, transform: "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")",
        tabindex: "0", role: "button",
        "aria-label": id + " 狀態" + statusLabel(row.status) + "，Speed Loss " + fmt(speedLossOf(row), 1) + "%"
      });
      g.dataset.vessel = id;
      if (row.status === "ACT") {
        g.appendChild(svg("circle", { class: "pulse", r: 14, cx: 0, cy: 0, fill: "#EF6F53" }));
      }
      g.appendChild(svg("circle", { class: "halo", r: 17, cx: 0, cy: 0 }));
      g.appendChild(svg("circle", { class: "ring-sel", r: 15, cx: 0, cy: 0 }));
      g.appendChild(svg("circle", { class: "core", r: 8, cx: 0, cy: 0 }));
      g.appendChild(svg("text", { class: "lbl", x: 0, y: -20, "text-anchor": "middle" }, id));

      var pick = function () { select(id); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
      layer.appendChild(g);
    });
  }

  /* ---------- detail panel ---------- */
  function renderDetail(row) {
    var host = document.getElementById("shipDetail");
    if (!host) return;
    if (!row) {
      host.replaceChildren(el("p", "empty", "點選雷達上的船點或下方船名，查看該船的效能摘要。"));
      return;
    }
    var cls = statusClass(row.status);
    var head = el("div", "sd-head");
    head.append(el("span", "dot " + cls));
    head.append(el("span", "name", String(row.vesselId || "—")));
    head.append(el("span", "badge " + cls, statusLabel(row.status)));

    var rows = el("div", "sd-rows");
    function addRow(k, v) {
      var r = el("div", "sd-row");
      r.append(el("span", "k", k), el("span", "v", v));
      rows.append(r);
    }
    addRow("Speed Loss", fmt(speedLossOf(row), 1) + "%");
    addRow("預估達門檻", forecastText(row));
    addRow("汙損歸因", fmt(row.foulingAttributionPct, 0) + "%");
    addRow("塗層效果", effLabel(row.cleaningEffectiveness));
    addRow("信心 · 樣本", (row.confidence || "N/A") + " · n=" + fmt(row.sampleDays, 0));

    var cta = el("a", "sd-cta", "在決策看板檢視此船 →");
    cta.href = "/dashboard.html";

    host.replaceChildren(head, rows, cta);
  }

  /* ---------- chip strip ---------- */
  function renderChips() {
    var host = document.getElementById("chipRow");
    if (!host) return;
    var frag = document.createDocumentFragment();
    state.vessels.forEach(function (row) {
      var id = String(row.vesselId || "—");
      var chip = el("button", "ship-chip");
      chip.type = "button";
      chip.dataset.vessel = id;
      chip.setAttribute("aria-pressed", "false");
      chip.append(el("i", statusClass(row.status)), el("span", "", id));
      chip.addEventListener("click", function () { select(id); });
      frag.append(chip);
    });
    host.replaceChildren(frag);
  }

  /* ---------- selection sync ---------- */
  function select(id) {
    state.selected = id;
    var row = state.vessels.find(function (v) { return String(v.vesselId) === id; });
    renderDetail(row);
    document.querySelectorAll(".ship-layer .ship").forEach(function (g) {
      g.classList.toggle("is-active", g.dataset.vessel === id);
    });
    document.querySelectorAll("#chipRow .ship-chip").forEach(function (c) {
      c.setAttribute("aria-pressed", String(c.dataset.vessel === id));
    });
  }

  /* ---------- status banner ---------- */
  function setStatus(text, offline) {
    var host = document.getElementById("mapStatus");
    if (!host) return;
    host.classList.toggle("is-offline", !!offline);
    host.replaceChildren(el("span", "live-dot"), el("span", "", text));
  }

  /* ---------- boot ---------- */
  function boot() {
    var frame = document.getElementById("radarFrame");
    if (!frame) return;
    var radar = buildRadar();
    frame.appendChild(radar.root);

    fetch("/api/fleet/summary")
      .then(function (res) {
        if (!res.ok) throw new Error(res.status + " " + res.statusText);
        return res.json();
      })
      .then(function (data) {
        var rows = Array.isArray(data) ? data.slice() : [];
        rows.sort(function (a, b) {
          var r = statusRank(a.status) - statusRank(b.status);
          if (r !== 0) return r;
          return Number(speedLossOf(b)) - Number(speedLossOf(a));
        });
        state.vessels = rows;
        drawShips(radar.ships);
        renderChips();
        var act = rows.filter(function (r) { return r.status === "ACT"; }).length;
        var watch = rows.filter(function (r) { return r.status === "WATCH"; }).length;
        setStatus(rows.length + " 艘即時 · " + act + " 行動 / " + watch + " 注意", false);
        renderDetail(null);
      })
      .catch(function (err) {
        setStatus("離線 · 無法載入船隊（" + (err && err.message ? err.message : "unknown") + "）", true);
        renderDetail(null);
        var host = document.getElementById("chipRow");
        if (host) host.replaceChildren(el("p", "empty", "尚無船隊資料。"));
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
