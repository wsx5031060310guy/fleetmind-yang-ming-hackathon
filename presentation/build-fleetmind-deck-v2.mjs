#!/usr/bin/env node
// FleetMind proposal deck — offline generator (pptxgenjs, no private deps).
// zh-TW, maritime navy theme, real hackathon numbers. Regenerate:
//   npm install -g pptxgenjs && node presentation/build-fleetmind-deck-v2.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = {
  navy: "0A2540", navy2: "12385C", teal: "1C7293", seafoam: "2A9D8F",
  amber: "F4A72B", coral: "E76F51", white: "FFFFFF", ink: "18293B",
  mute: "5A6B7B", panel: "F2F6F9", panel2: "E8EFF4", line: "CBD8E2",
};
const HEAD = "Microsoft JhengHei";
const BODY = "Microsoft JhengHei";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pptx.layout = "W";
pptx.author = "FleetMind";
pptx.title = "FleetMind — 陽明海運 AI 船舶效能分析與節能決策";

const W = 13.333, H = 7.5, M = 0.7;

function darkBg(s) { s.background = { color: C.navy }; }
function lightBg(s) { s.background = { color: C.white }; }

// eyebrow + title block on light slides
function head(s, eyebrow, title, titleColor = C.navy) {
  s.addText(eyebrow.toUpperCase(), { x: M, y: 0.5, w: W - 2 * M, h: 0.3, fontFace: BODY, fontSize: 12, color: C.teal, bold: true, charSpacing: 2, margin: 0 });
  s.addText(title, { x: M, y: 0.78, w: W - 2 * M, h: 0.75, fontFace: HEAD, fontSize: 30, color: titleColor, bold: true, margin: 0 });
}

function card(s, x, y, w, h, fill = C.panel) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.09, shadow: { type: "outer", color: "9FB2C0", opacity: 0.28, blur: 9, offset: 3, angle: 90 } });
}
function chip(s, x, y, w, txt, fill, tc = C.white) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.34, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.17 });
  s.addText(txt, { x, y, w, h: 0.34, align: "center", valign: "middle", fontFace: BODY, fontSize: 11, bold: true, color: tc, margin: 0 });
}

// ---------- Slide 1: cover ----------
let s = pptx.addSlide(); darkBg(s);
s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.navy } });
// subtle deep panel
s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.5, w: W, h: 2.5, fill: { color: C.navy2 } });
s.addText("FLEETMIND", { x: M, y: 1.55, w: 9, h: 0.5, fontFace: BODY, fontSize: 15, color: C.amber, bold: true, charSpacing: 6, margin: 0 });
s.addText("AI 船舶效能分析與\n節能決策支援系統", { x: M, y: 2.05, w: 11.4, h: 2.0, fontFace: HEAD, fontSize: 46, color: C.white, bold: true, lineSpacingMultiple: 1.02, margin: 0 });
s.addText("數字來自計算　語言來自 AI　決策留給人", { x: M, y: 4.35, w: 11, h: 0.5, fontFace: HEAD, fontSize: 19, color: C.seafoam, italic: true, margin: 0 });
s.addText([
  { text: "陽明海運 · 航運物流組", options: { bold: true, color: C.white } },
  { text: "    |    AWS Summit Taipei 2026 百工百業瘋 AI — AI Everywhere Hackathon", options: { color: "AEC4D6" } },
], { x: M, y: 5.9, w: 11.8, h: 0.4, fontFace: BODY, fontSize: 14, margin: 0 });
s.addText("團隊 FleetMind（工程 4 + 簡報 1）", { x: M, y: 6.35, w: 11, h: 0.35, fontFace: BODY, fontSize: 12, color: "8FA8BD", margin: 0 });
s.addNotes("[0:00–0:30] 開場：船舶推進效率隨時間衰退、油耗上升；養護能恢復但決策靠經驗。FleetMind 把它變成可計算、可解釋、人可拍板的決策支援。一句話定位：數字來自計算，語言來自 AI，決策留給人。");

// ---------- Slide 2: problem ----------
s = pptx.addSlide(); lightBg(s);
head(s, "The Problem", "船殼污損每天在偷油——但何時該清，全靠經驗");
s.addText("船殼與螺旋槳污損讓同樣航速要燒更多油。船東靠水下清潔（UWC）與拋光（PP）恢復效能，但「何時做、值不值得、省多少」目前多憑經驗，缺乏可量化、可歸因、可回溯的決策依據。", { x: M, y: 1.75, w: W - 2 * M, h: 0.9, fontFace: BODY, fontSize: 15, color: C.ink, lineSpacingMultiple: 1.15, margin: 0 });
const probStats = [
  { n: "15", u: "艘船 · 5 年", d: "匿名航行日報（noon report）", c: C.teal },
  { n: "21,282", u: "日報列", d: "＋ 77 筆水下養護事件", c: C.teal },
  { n: "-12% ~ +22%", u: "Speed Loss 全隊範圍", d: "從剛養護到重度污損", c: C.coral },
  { n: "102", u: "格待預測油耗", d: "官方客觀評分標的", c: C.amber },
];
probStats.forEach((p, i) => {
  const x = M + i * ((W - 2 * M - 0.4 * 3) / 4 + 0.4), w = (W - 2 * M - 0.4 * 3) / 4;
  card(s, x, 3.0, w, 2.9);
  s.addText(p.n, { x: x + 0.15, y: 3.35, w: w - 0.3, h: 0.9, fontFace: HEAD, fontSize: 30, bold: true, color: p.c, margin: 0 });
  s.addText(p.u, { x: x + 0.15, y: 4.3, w: w - 0.3, h: 0.4, fontFace: BODY, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
  s.addText(p.d, { x: x + 0.15, y: 4.75, w: w - 0.3, h: 0.9, fontFace: BODY, fontSize: 11.5, color: C.mute, lineSpacingMultiple: 1.1, margin: 0 });
});
s.addText("資料由命題企業提供，僅存於競賽 AWS 帳號、不進版控、賽後刪除。", { x: M, y: 6.25, w: W - 2 * M, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: C.mute, margin: 0 });
s.addNotes("[0:30–1:10] 點出痛點：污損偷油、養護決策靠經驗。用真資料規模帶出我們有本錢做量化。");

// ---------- Slide 3: what we built (2 deliverables) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "Our Solution", "兩條主線，直攻 55% 硬分數");
const deliv = [
  { tag: "客觀評分 25%", tagc: C.amber, t: "油耗預測模型", pts: ["預測 102 格被遮蔽的全速油耗", "反事實推論：現在做 UWC/PP 能省多少", "污損時鐘 + 跨姊妹船遷移學習"], foot: "predict/ · Python · sklearn" },
  { tag: "專家品評 30%", tagc: C.seafoam, t: "Speed Loss Dashboard", pts: ["ISO 19030 框架下的效能衰退趨勢", "船殼 vs 螺旋槳歸因", "養護事件與效能恢復時序對比"], foot: "core-calc + apps/api · Java / Spring Boot" },
];
deliv.forEach((d, i) => {
  const x = i === 0 ? M : W / 2 + 0.2, w = W / 2 - M - 0.2;
  card(s, x, 1.85, w, 3.7);
  chip(s, x + 0.35, 2.15, 1.7, d.tag, d.tagc, i === 0 ? C.navy : C.white);
  s.addText(d.t, { x: x + 0.35, y: 2.65, w: w - 0.7, h: 0.55, fontFace: HEAD, fontSize: 23, bold: true, color: C.navy, margin: 0 });
  s.addText(d.pts.map((p, j) => ({ text: p, options: { bullet: { code: "2022", indent: 14 }, color: C.ink, breakLine: j < d.pts.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.35, y: 3.3, w: w - 0.7, h: 1.5, fontFace: BODY, fontSize: 14, margin: 0 });
  s.addText(d.foot, { x: x + 0.35, y: 5.05, w: w - 0.7, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: C.teal, bold: true, margin: 0 });
});
s.addText("＋ 20% 商務決策價值（ROI 反事實）　＋ 15% 技術可行性　＋ 10% AI 協作創意", { x: M, y: 5.85, w: W - 2 * M, h: 0.4, align: "center", fontFace: BODY, fontSize: 13.5, bold: true, color: C.mute, margin: 0 });
s.addNotes("[1:10–1:50] 兩個產出對應 30%+25% 硬分數；其餘三維度靠 ROI、單服務架構、AI guardrail。");

// ---------- Slide 4: data & method ----------
s = pptx.addSlide(); lightBg(s);
head(s, "Data & Method", "從噪音日報到可比的效能指標");
// left: pipeline
const steps = [
  ["1", "載入 + 驗證", "15 船日報 + 77 養護事件；型別/範圍檢查，不刪列只標旗標"],
  ["2", "事件直接對齊", "maintenance.event_day 與日報 NOON_UTC 同軸，直接 join（無日曆錨點難題）"],
  ["3", "效能指標 k", "k = Daily FOC / STW³；以對水速度 STW 正規化，隔離洋流與航速"],
  ["4", "同速帶比較", "參考窗 10–15 合格日、±1 kn 同速帶、Theil-Sen 穩健趨勢"],
];
steps.forEach((st, i) => {
  const y = 1.95 + i * 1.18;
  s.addShape(pptx.ShapeType.ellipse, { x: M, y, w: 0.62, h: 0.62, fill: { color: C.navy }, line: { type: "none" } });
  s.addText(st[0], { x: M, y, w: 0.62, h: 0.62, align: "center", valign: "middle", fontFace: HEAD, fontSize: 20, bold: true, color: C.amber, margin: 0 });
  s.addText(st[1], { x: M + 0.85, y: y - 0.03, w: 5.1, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
  s.addText(st[2], { x: M + 0.85, y: y + 0.38, w: 5.3, h: 0.7, fontFace: BODY, fontSize: 12, color: C.mute, lineSpacingMultiple: 1.08, margin: 0 });
});
// right: ships card
card(s, 7.55, 1.95, W - M - 7.55, 4.55, C.navy);
s.addText("船隊結構", { x: 7.85, y: 2.2, w: 4.5, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true, color: C.white, margin: 0 });
const shipRows = [
  ["訓練船 S1–S12", "全量可見", C.seafoam],
  ["預測船 S21–S23", "養護後遮蔽 · 102 格", C.amber],
  ["W1 型　S1–S8, S21", "同設計姊妹船", "AEC4D6"],
  ["W2 型　S9–S12, S22–S23", "不同航線", "AEC4D6"],
];
shipRows.forEach((r, i) => {
  const y = 2.75 + i * 0.82;
  s.addText(r[0], { x: 7.85, y, w: 4.9, h: 0.4, fontFace: BODY, fontSize: 13.5, bold: true, color: C.white, margin: 0 });
  s.addText(r[1], { x: 7.85, y: y + 0.32, w: 4.9, h: 0.35, fontFace: BODY, fontSize: 11.5, color: typeof r[2] === "string" && r[2].length === 6 ? r[2] : C.white, margin: 0 });
});
s.addText("被遮蔽的 3 艘預測船，在同型訓練船上有大量可見歷史 → 遷移學習。", { x: 7.85, y: 6.05, w: 4.9, h: 0.6, fontFace: BODY, fontSize: 11, italic: true, color: C.seafoam, lineSpacingMultiple: 1.1, margin: 0 });
s.addNotes("[1:50–2:35] 方法核心：k=FOC/STW³ 把速度與洋流正規化，只在同速帶比 k，減速不會被誤記成污損。");

// ---------- Slide 5: dashboard + fleet chart (official item 1) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ①　Speed Loss Dashboard", "船隊即時盤點：誰在漏油，先看誰");
const fleet = [
  ["S11", 21.8], ["S23", 8.9], ["S6", 8.8], ["S4", 8.7], ["S12", 8.4], ["S8", 8.4], ["S9", 6.4], ["S5", 4.3],
];
s.addChart(pptx.ChartType.bar, [{ name: "Speed Loss %", labels: fleet.map(f => f[0]), values: fleet.map(f => f[1]) }], {
  x: M, y: 1.9, w: 7.0, h: 4.6, barDir: "col",
  chartColors: [C.teal], showTitle: false, showLegend: false,
  showValue: true, dataLabelPosition: "outEnd", dataLabelColor: C.ink, dataLabelFontSize: 11, dataLabelFontBold: true, dataLabelFormatCode: '0.0"%"',
  catAxisLabelColor: C.ink, catAxisLabelFontSize: 12, catAxisLabelFontBold: true,
  valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
  valAxisMinVal: 0, valAxisMaxVal: 25,
});
s.addText("依 Speed Loss 排序的船隊優先盤點（前 8 名）", { x: M, y: 6.55, w: 7, h: 0.3, fontFace: BODY, fontSize: 11, italic: true, color: C.mute, margin: 0 });
// right feature list
const feats = [
  ["互動趨勢圖", "點選任一船，看 Speed Loss 隨航程變化、事件標記、資料缺口"],
  ["歸因卡", "每船顯示船殼/螺旋槳佔比、信心等級與樣本數 n"],
  ["Before-After", "養護事件前後 median k 對比與恢復幅度"],
  ["誠實信心", "顯示 ±區間、n、未解釋殘差，不做假精確"],
];
card(s, 8.05, 1.9, W - M - 8.05, 4.6, C.panel);
feats.forEach((f, i) => {
  const y = 2.2 + i * 1.05;
  s.addText(f[0], { x: 8.35, y, w: 4.3, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy, margin: 0 });
  s.addText(f[1], { x: 8.35, y: y + 0.34, w: 4.35, h: 0.62, fontFace: BODY, fontSize: 11.5, color: C.mute, lineSpacingMultiple: 1.08, margin: 0 });
});
s.addNotes("[2:35–3:35] Demo（最長，實機操作）：真資料 15 船，點 S11（最嚴重、692 天沒清）看趨勢；再點 S23 看歸因。強調數字全來自 core-calc 確定性計算。");

// ---------- Slide 6: attribution + UWI honesty ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ②a　效能歸因", "污損是船殼還是螺旋槳？—— 分開才好排養護");
card(s, M, 1.9, 5.6, 4.5, C.navy);
s.addText("S23 範例", { x: M + 0.35, y: 2.15, w: 4.9, h: 0.4, fontFace: BODY, fontSize: 13, color: C.seafoam, bold: true, margin: 0 });
s.addText("96%", { x: M + 0.35, y: 2.55, w: 4.9, h: 1.0, fontFace: HEAD, fontSize: 58, bold: true, color: C.amber, margin: 0 });
s.addText("Speed Loss 來自船殼污損", { x: M + 0.35, y: 3.65, w: 4.9, h: 0.4, fontFace: BODY, fontSize: 15, bold: true, color: C.white, margin: 0 });
s.addText([
  { text: "螺旋槳僅佔 4%", options: { color: "AEC4D6", breakLine: true } },
  { text: "→ 建議優先安排水下清潔（UWC），拋光次之", options: { color: C.seafoam } },
], { x: M + 0.35, y: 4.15, w: 4.9, h: 0.9, fontFace: BODY, fontSize: 13, lineSpacingMultiple: 1.2, margin: 0 });
s.addText("方法：以隔離區段（只影響螺旋槳 / 只影響船殼的窗口）各自量 k 漂移率拆分；區段稀疏時退回標記過的 50/50，不假裝精準。", { x: M + 0.35, y: 5.2, w: 4.9, h: 1.0, fontFace: BODY, fontSize: 11, italic: true, color: "8FA8BD", lineSpacingMultiple: 1.12, margin: 0 });
// right: UWI honesty
card(s, 6.75, 1.9, W - M - 6.75, 4.5, C.panel);
s.addText("誠實處理「純檢查」事件（UWI）", { x: 7.05, y: 2.15, w: 5.4, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
s.addText([
  { text: "官方提示：純檢查（UWI）不清不拋，不該帶來效能改善。", options: { color: C.ink, breakLine: true, paraSpaceAfter: 10 } },
  { text: "我們的做法 — 兩個地方，兩種角色：", options: { bold: true, color: C.navy, breakLine: true, paraSpaceAfter: 6 } },
  { text: "預測模型：污損時鐘在 UWI 不重置 → 模型不會幻覺出一段恢復（物理先驗放這裡）。", options: { bullet: { code: "2022" }, color: C.ink, breakLine: true, paraSpaceAfter: 6 } },
  { text: "Dashboard：呈現實測 k 變化 + 信心，不宣稱「零變化」（稀疏資料上仍有雜訊，誠實顯示）。", options: { bullet: { code: "2022" }, color: C.ink, breakLine: true } },
], { x: 7.05, y: 2.65, w: 5.4, h: 3.4, fontFace: BODY, fontSize: 12.5, lineSpacingMultiple: 1.12, margin: 0 });
s.addNotes("[3:35–4:25] 這頁是誠信亮點。把物理先驗（模型時鐘不重置）和統計實測（dashboard 顯示雜訊）分開，準備好回答『你模型說 UWI 不改善但圖上有變化』。");

// ---------- Slide 7: prediction model (official item 2 + 4) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ②b + ④　油耗預測模型", "在只給部分特徵下，還原被遮蔽的油耗");
const mstats = [
  { n: "3.51", u: "MT　RMSE", c: C.navy },
  { n: "5.22", u: "%　MAPE", c: C.navy },
  { n: "102/102", u: "格提交 1:1", c: C.seafoam },
];
mstats.forEach((p, i) => {
  const x = M + i * 2.55, w = 2.35;
  card(s, x, 1.85, w, 1.5);
  s.addText(p.n, { x: x + 0.15, y: 2.0, w: w - 0.3, h: 0.7, fontFace: HEAD, fontSize: 28, bold: true, color: p.c, margin: 0 });
  s.addText(p.u, { x: x + 0.15, y: 2.72, w: w - 0.3, h: 0.5, fontFace: BODY, fontSize: 12, bold: true, color: C.mute, margin: 0 });
});
s.addText([
  { text: "演算法　", options: { bold: true, color: C.navy } },
  { text: "物理 baseline（k·STW³）→ 梯度提升樹（HistGBM）→ 依驗證擇優", options: { color: C.ink } },
], { x: M, y: 3.55, w: 7.0, h: 0.5, fontFace: BODY, fontSize: 13, margin: 0 });
s.addText([
  { text: "特徵　", options: { bold: true, color: C.navy } },
  { text: "STW/STW³/RPM/滑差 · 吃水載況 · 風浪湧水溫 · 污損時鐘（UWI 不重置）· 船型 W1/W2 · 燃料熱值", options: { color: C.ink } },
], { x: M, y: 4.05, w: 7.0, h: 0.8, fontFace: BODY, fontSize: 13, lineSpacingMultiple: 1.12, margin: 0 });
s.addText([
  { text: "防漏答驗證　", options: { bold: true, color: C.navy } },
  { text: "在可見船上模擬真實遮蔽（事件後合格日窗藏答案再評分）+ 跨船 GroupKFold，不用隨機 K-fold。", options: { color: C.ink } },
], { x: M, y: 4.95, w: 7.0, h: 0.9, fontFace: BODY, fontSize: 13, lineSpacingMultiple: 1.12, margin: 0 });
// right honesty card
card(s, 8.05, 1.85, W - M - 8.05, 4.0, C.panel2);
s.addText("刻意的簡單", { x: 8.35, y: 2.1, w: 4.3, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
s.addText("我們試過更複雜的堆疊與單調約束——在防漏驗證上都沒贏過樸素 GBM baseline，於是資料驅動地選 baseline。", { x: 8.35, y: 2.55, w: 4.35, h: 1.3, fontFace: BODY, fontSize: 13, color: C.ink, lineSpacingMultiple: 1.18, margin: 0 });
s.addText("「不 ship 比 baseline 差的模型」是原則，不是能力上限。", { x: 8.35, y: 3.95, w: 4.35, h: 0.9, fontFace: BODY, fontSize: 12, italic: true, color: C.teal, bold: true, lineSpacingMultiple: 1.15, margin: 0 });
s.addText("提交標的：全速時段油耗總量（MT），以每小時率×全速時數還原。", { x: 8.35, y: 5.0, w: 4.35, h: 0.7, fontFace: BODY, fontSize: 11, color: C.mute, lineSpacingMultiple: 1.1, margin: 0 });
s.addNotes("[4:25–5:25] 誠實：baseline 勝出。強調防漏驗證的嚴謹（模擬真實遮蔽），這是評審會追問的點。");

// ---------- Slide 8: ROI / business value ----------
s = pptx.addSlide(); darkBg(s);
s.addText("官方必含（商務價值 20%）", { x: M, y: 0.5, w: 11, h: 0.3, fontFace: BODY, fontSize: 12, color: C.amber, bold: true, charSpacing: 2, margin: 0 });
s.addText("同一個模型回答：現在清，能省多少？", { x: M, y: 0.8, w: 11.8, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: C.white, margin: 0 });
s.addText("反事實推論：把污損時鐘歸零重新預測，得到每天可省油量、年省金額與回本天數（油價 USD 650/MT）。", { x: M, y: 1.65, w: W - 2 * M, h: 0.5, fontFace: BODY, fontSize: 14, color: "AEC4D6", margin: 0 });
const roi = [
  ["S23", "24.4%", "16.4 MT/日", "≈ US$3.9M/年", "HIGH · n=506"],
  ["S6", "25.1%", "14.8 MT/日", "≈ US$3.5M/年", "LOW · 樣本不足"],
  ["S11", "52.3%", "40.1 MT/日", "≈ US$9.5M/年", "極端 · 692 天未清"],
];
// table header
const cols = [1.5, 2.3, 2.6, 3.0, 2.5];
const cx = [M, M + 1.5, M + 3.8, M + 6.4, M + 9.4];
const hd = ["船", "可省比例", "每日省油", "年省金額", "信心"];
card(s, M, 2.4, W - 2 * M, 3.6, C.navy2);
hd.forEach((h2, i) => s.addText(h2, { x: cx[i] + 0.2, y: 2.6, w: cols[i], h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: C.seafoam, margin: 0 }));
roi.forEach((r, ri) => {
  const y = 3.15 + ri * 0.86;
  r.forEach((cell, ci) => {
    const isMoney = ci === 3, isPct = ci === 1;
    s.addText(cell, { x: cx[ci] + 0.2, y, w: cols[ci] + 0.3, h: 0.5, fontFace: ci === 0 || isMoney ? HEAD : BODY, fontSize: isMoney ? 17 : (ci === 0 ? 17 : 14), bold: ci === 0 || isMoney || isPct, color: isMoney ? C.amber : C.white, valign: "middle", margin: 0 });
  });
});
s.addText("決策支援，非自動指令：低信心→先做便宜的水下檢查；高信心且回本快→建議清潔；最終由輪機主管拍板。", { x: M, y: 6.25, w: W - 2 * M, h: 0.5, fontFace: BODY, fontSize: 12.5, italic: true, color: "8FA8BD", margin: 0 });
s.addNotes("[5:25–6:20] 主打 S23（HIGH 信心、船殼 96%）：清一次年省近 400 萬美金。S11 是極端案例。強調人在迴路、數字可回溯。");

// ---------- Slide 9: gaps & more data (official item 3) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ③　未盡之處與資料價值", "誠實說限制，明確說要什麼");
const gaps = [
  ["正午報表粒度", "無軸功率、對水速度計等高頻量測；k=FOC/STW³ 為 ISO 19030 的務實代理"],
  ["洋流系統性偏差", "SOG/STW 有差；有對水速度計可直接校正"],
  ["歸因區段稀疏", "部分船退回標記過的 50/50；需更多養護紀錄校準"],
  ["UWI 統計雜訊", "稀疏同速帶上仍有量測變化，誠實呈現而非壓平"],
];
const wants = [
  "軸功率計 + 對水速度計 → 直接升級 ISO 19030 全合規",
  "進塢後海試曲線 → 更準的效能參考基準",
  "貴司 UWC/PP 恢復幅度紀錄 → 歸因與 ROI 有 ground truth",
  "塗層年限 / 吃水俯仰 trim / 航線港口 → 更強的決策依據",
];
s.addText("本次分析的限制", { x: M, y: 1.75, w: 5.8, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true, color: C.navy, margin: 0 });
gaps.forEach((g, i) => {
  const y = 2.25 + i * 1.02;
  card(s, M, y, 5.8, 0.88, C.panel);
  s.addText(g[0], { x: M + 0.25, y: y + 0.1, w: 5.3, h: 0.35, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.coral, margin: 0 });
  s.addText(g[1], { x: M + 0.25, y: y + 0.42, w: 5.35, h: 0.44, fontFace: BODY, fontSize: 11, color: C.mute, lineSpacingMultiple: 1.05, margin: 0 });
});
card(s, 7.0, 1.75, W - M - 7.0, 4.65, C.navy);
s.addText("給我們更多資料，能強化的決策價值", { x: 7.3, y: 2.0, w: 5.1, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.white, margin: 0 });
s.addText(wants.map((w2, j) => ({ text: w2, options: { bullet: { code: "2022", indent: 14 }, color: "E6EEF5", breakLine: j < wants.length - 1, paraSpaceAfter: 12 } })), { x: 7.3, y: 2.6, w: 5.1, h: 3.4, fontFace: BODY, fontSize: 13, lineSpacingMultiple: 1.1, margin: 0 });
s.addNotes("[6:20–6:55] 主動揭露限制 = 誠信分。同時把『要什麼資料』講清楚，回應官方必含第 3 項與商務價值。");

// ---------- Slide 10: architecture + AI role (official item 4 + 5) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ④ 架構 + ⑤ AI 角色", "單服務同源 · AI 只翻譯不發明");
// flow row
const flow = [
  ["S3", "航行/養護資料", C.teal],
  ["core-calc + predict", "確定性計算 + 預測（數字唯一來源）", C.navy],
  ["Spring Boot", "API + Dashboard 同源", C.seafoam],
  ["Bedrock (Claude)", "決策簡報 · guardrail", C.amber],
];
flow.forEach((f, i) => {
  const w = 2.75, gap = 0.42, x = M + i * (w + gap);
  card(s, x, 2.0, w, 1.5, f[2]);
  s.addText(f[0], { x: x + 0.15, y: 2.2, w: w - 0.3, h: 0.5, fontFace: HEAD, fontSize: 16, bold: true, color: i === 3 ? C.navy : C.white, margin: 0 });
  s.addText(f[1], { x: x + 0.15, y: 2.72, w: w - 0.3, h: 0.7, fontFace: BODY, fontSize: 11, color: i === 3 ? C.navy : "E6EEF5", lineSpacingMultiple: 1.05, margin: 0 });
  if (i < 3) s.addText("▶", { x: x + w + 0.02, y: 2.55, w: 0.38, h: 0.4, align: "center", valign: "middle", fontFace: BODY, fontSize: 16, color: C.line, margin: 0 });
});
s.addText("部署　App Runner（fallback ECS Express / EC2）· S3 · DynamoDB · Bedrock · CloudWatch · region us-east-1", { x: M, y: 3.7, w: W - 2 * M, h: 0.4, fontFace: BODY, fontSize: 12.5, color: C.mute, margin: 0 });
// AI role
card(s, M, 4.3, W - 2 * M, 2.05, C.panel);
s.addText("AI 的角色：數字來自計算，語言來自 AI，決策留給人", { x: M + 0.35, y: 4.5, w: W - 2 * M - 0.7, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
s.addText([
  { text: "Bedrock(Claude) 只把已算好的指標改寫成營運語言；guardrail 逐一比對每個數字的引用來源，未引用或引錯即攔下——AI 無法發明數字。", options: { color: C.ink, breakLine: true, paraSpaceAfter: 6 } },
  { text: "失敗降級：Bedrock 不可用 → 該船快取簡報 → deterministic 模板；dashboard 與 55% 硬分數不受影響。開發全程以 Kiro 為 AI 助手。", options: { color: C.ink } },
], { x: M + 0.35, y: 4.95, w: W - 2 * M - 0.7, h: 1.3, fontFace: BODY, fontSize: 12.5, lineSpacingMultiple: 1.15, margin: 0 });
s.addNotes("[6:55–7:35] 架構一句話：單服務同源、AWS-only、AI 有 guardrail 不亂編。回應官方第 4、5 項。");

// ---------- Slide 11: close ----------
s = pptx.addSlide(); darkBg(s);
s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.2, w: W, h: 2.2, fill: { color: C.navy2 } });
s.addText("FLEETMIND", { x: M, y: 1.5, w: 9, h: 0.4, fontFace: BODY, fontSize: 13, color: C.amber, bold: true, charSpacing: 5, margin: 0 });
s.addText("把船隊的效能衰退，變成可計算、\n可歸因、人可拍板的節能決策", { x: M, y: 2.0, w: 11.6, h: 1.6, fontFace: HEAD, fontSize: 33, bold: true, color: C.white, lineSpacingMultiple: 1.05, margin: 0 });
const closeItems = [
  ["Speed Loss Dashboard", "真資料 15 船 · ISO 19030 · 船殼/螺旋槳歸因"],
  ["油耗預測 102 格", "RMSE 3.51 MT · 防漏驗證 · 反事實 ROI"],
  ["決策支援 · 人在迴路", "AI 解釋不發明 · 單服務 AWS 架構"],
];
closeItems.forEach((c, i) => {
  const w = (W - 2 * M - 0.6) / 3, x = M + i * (w + 0.3);
  s.addText(c[0], { x, y: 5.35, w, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.seafoam, margin: 0 });
  s.addText(c[1], { x, y: 5.75, w, h: 0.7, fontFace: BODY, fontSize: 11.5, color: "AEC4D6", lineSpacingMultiple: 1.1, margin: 0 });
});
s.addText("謝謝聆聽　·　FleetMind × 陽明海運", { x: M, y: 6.7, w: 11, h: 0.4, fontFace: BODY, fontSize: 13, color: "8FA8BD", margin: 0 });
s.addNotes("[7:35–8:00] 收尾：三個交付一句話帶過，回到定位句，進 Q&A。");

// ---------- Q&A backup slides (full 20, from docs/07) ----------
function qaSlide(title, qas) {
  const b = pptx.addSlide(); lightBg(b);
  head(b, "Q&A Backup", title);
  const gap = (5.4) / qas.length;
  let y = 1.85;
  qas.forEach((qa) => {
    b.addText("Q　" + qa[0], { x: M, y, w: W - 2 * M, h: 0.35, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.navy, margin: 0 });
    b.addText("A　" + qa[1], { x: M, y: y + 0.36, w: W - 2 * M, h: gap - 0.42, fontFace: BODY, fontSize: 11.5, color: C.ink, lineSpacingMultiple: 1.08, margin: 0 });
    y += gap;
  });
  return b;
}
qaSlide("資料與方法", [
  ["拿到什麼資料？怎麼跟養護事件對上？", "15 船×5 年日報（21,282 列）+ 77 養護事件。maintenance 用 event_day 與日報 NOON_UTC 同軸，直接 join，無日曆錨點問題。"],
  ["只有 3 艘要預測，樣本夠嗎？", "船型 W1/W2 姊妹船；預測船在同型訓練船上有大量可見歷史 → 遷移學習，正是官方要的能力。"],
  ["STW 還是 SOG？洋流怎麼處理？", "阻力物理一律用 STW（對水）；k=FOC/STW³ 正規化速度，只在 ±1 kn 同速帶比 k，洋流不會被誤記成污損。"],
  ["預測的到底是什麼值？", "當日全速時段主機油耗總量（MT，原欄位語義），非 24h 正規化。內部以每小時率×全速時數還原。"],
]);
qaSlide("預測模型", [
  ["用什麼模型？效果多少？", "sklearn；物理 baseline→HistGBM→擇優。最佳為樸素 GBM baseline，模擬遮蔽 RMSE 3.51 MT / MAPE 5.22%。更複雜的沒贏過 → 不上。"],
  ["怎麼確定沒偷看答案？", "不用隨機 K-fold。在可見船上模擬真實遮蔽（事件後合格日窗藏答案再預測、逐窗評分）+ GroupKFold 確認跨船遷移。"],
  ["RPM/SFOC 不是能反推油耗？算洩漏？", "H 類（SFOC/馬力/推力）在預測窗本就遮蔽、不用。ME_AVG_RPM 屬可見運轉條件、非答案代理；使用邊界也列入問主辦。"],
  ["模型有信心區間嗎？", "每格附 ±band（同船型×燃料 slice 的殘差 std）；submission 主檔維持 4 欄 102 列，信心另存輔助檔。"],
]);
qaSlide("Speed Loss / ISO 19030", [
  ["對齊 ISO 19030 哪個層級？", "noon-report 粒度務實改編，不宣稱全合規。k=FOC/STW³ 當 performance value 代理，骨架照 ISO：定參考期、控速帶、看偏移；偏離四點有明列表。"],
  ["全隊都降速了，怎麼分商業減速與污損？", "從不比原始 FOC/航速。k 先正規化速度，只在同速帶比；基準取事件後首 10–15 合格日、上限 60 天。減速改變 V 不改變 k。"],
  ["Speed Loss % 可信嗎？", "段內對 k 做 Theil-Sen 穩健迴歸（抗離群）；主 KPI 顯示 3.5%（±0.8）· 中信心 · n=12，未解釋殘差一定顯示，不做假精確。"],
  ["船殼 vs 螺旋槳怎麼拆？", "隔離區段各量 k 漂移率拆分；區段稀疏時退回標記過的 50/50，明講『因區段不足暫用預設』，不假裝精準。"],
]);
qaSlide("UWI 判讀 · 商務價值", [
  ["UWI 你說不改善，但圖上有變化？", "兩個地方兩種角色：物理先驗放『預測模型污損時鐘不因 UWI 重置』；dashboard 誠實顯示實測 delta+信心，不硬壓成零。刻意分開統計實測與物理先驗。"],
  ["這系統怎麼幫我省錢？講數字。", "反事實：把污損時鐘歸零重預測，得每天可省油量、年省金額、回本天數（油價 US$650/MT）。S23 清一次年省近 US$3.9M。"],
  ["AI 會自己排清潔嗎？", "不會，決策支援、人拍板。低信心→先做便宜水下檢查；高信心且回本快→建議清潔。反事實是檢視證據，不是自動指令。"],
  ["資料品質差的日子會硬給建議嗎？", "被拒列標原因+品質分；可比樣本不足時不出高信心建議，改建議先做檢查。信心與 n 永遠跟著數字顯示。"],
]);
qaSlide("AI · AWS · 限制", [
  ["AI 扮演什麼角色？怎麼防亂編數字？", "數字來自計算、語言來自 AI。Bedrock(Claude) 只改寫已算好的指標；guardrail 逐一比對每個數字的引用來源，未引用/引錯即攔——無法發明數字。開發用 Kiro。"],
  ["架構？成本？為何不上 SageMaker？", "單一 Spring Boot on App Runner + S3 + DynamoDB + Bedrock + CloudWatch，us-east-1，約 <US$70/月。ISO 19030 本身確定性、樣本少硬煉會過擬合，且複雜模型沒贏過 baseline。"],
  ["最大的限制是什麼？（主動揭露）", "①SOG 非對水速度、洋流系統偏差 ②無軸功率、k 是代理 ③歸因稀疏時退 50/50 ④UWI 仍有量測雜訊，呈現而非壓平。都在 UI/偏離表明示。"],
  ["給更多資料會怎麼強化？", "軸功率計+對水速度計→升級 ISO 19030 全合規；海試曲線→更準基準；貴司 UWC/PP 恢復幅度紀錄→歸因與 ROI 有 ground truth。框架不改、餵更好量測即升級。"],
]);

const out = path.join(__dirname, "fleetmind-proposal-deck.pptx");
await pptx.writeFile({ fileName: out });
console.log("wrote", out);
