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
  // seafoam only clears 4.5:1 on FLAT navy (4.67) — any photo behind it drops it under.
  // Measured on the cover backdrop: 2A9D8F = 2.46:1, 6FE7CF = 5.46:1. This is the same
  // lift architecture.html already uses for hero text over its port-dusk photo.
  seafoamOnPhoto: "6FE7CF",
};
// Hiragino Sans — 這台 LibreOffice 唯一解析得出的 CJK 黑體, 且 W3/W6 是真的細/粗
// 配對 (bold 不必合成)。正體字形已驗過為 TC 形, 非日文字形。
//
// 別換回 Microsoft JhengHei (Windows 字體) / PingFang TC / Heiti TC / STHeiti:
// 這台通通解不出來, 會逐 script fallback → 中文掉 STSongti (宋體) 或 DFWaWaSC (娃娃體)、
// 粗體中文掉 WeibeiSC (魏碑書法體)、拉丁掉 Arial-Black, 同一行三種字體。
// fc-list / find 看不出來 (LibreOffice 走 CoreText, 不是 fontconfig) — 改字體後
// 一律用 `pdffonts` 驗算出的 PDF: 只該有 HiraginoSans-W3/W6, 出現 Songti/Weibei/WaWa 就是壞了。
//
// 另: CJK 沒有 italic 切片, 對含中文的 run 下 italic 會被替換成書法/楷體 → 最難讀。
// italic 只留給純拉丁 run。
const HEAD = "Hiragino Sans";
const BODY = "Hiragino Sans";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pptx.layout = "W";
pptx.author = "FleetMind";
pptx.title = "FleetMind — 陽明海運 AI 船舶效能分析與節能決策";

const W = 13.333, H = 7.5, M = 0.7;

function darkBg(s) { s.background = { color: C.navy }; }
function lightBg(s) { s.background = { color: C.white }; }

/* Full-bleed photo + navy scrim. The images are 1280x720 and the slide is 13.333x7.5 —
   both 16:9, so nothing crops. `transparency` is how see-through the scrim is, so a
   HIGHER number means a more visible photo and less contrast for the text on top.
   Callers pass a value measured from the rendered slide. */
function photoBg(s, file, scrimTransparency) {
  s.addImage({ path: path.join(__dirname, "img", file), x: 0, y: 0, w: W, h: H });
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: W, h: H,
    fill: { color: C.navy, transparency: scrimTransparency },
    line: { type: "none" },
  });
}

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
/* Photography only on the three dark slides. The light content slides keep their white
   ground: the numbers are the point there, and a photo behind a stat card only fights it.
   Assets are grok-generated and deliberately text-free (`no text, no logos` in the prompt)
   — every figure in this deck stays real vector text a judge can check against the live
   site. A number rendered as AI pixels could not be grepped, corrected, or trusted, and
   this deck's whole claim is 「數字不是 AI 掰的」.
   The ship sits right-of-frame and the sky is empty on the left, which is where the title
   block lands. Scrim transparency was set by measuring the rendered JPG, not by eye. */
photoBg(s, "cover-ship-dusk.jpg", 42);
s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.5, w: W, h: 2.5, fill: { color: C.navy2, transparency: 22 } });
s.addText("FLEETMIND", { x: M, y: 1.55, w: 9, h: 0.5, fontFace: BODY, fontSize: 15, color: C.amber, bold: true, charSpacing: 6, margin: 0 });
s.addText("AI 船舶效能分析與\n節能決策支援系統", { x: M, y: 2.05, w: 11.4, h: 2.0, fontFace: HEAD, fontSize: 46, color: C.white, bold: true, lineSpacingMultiple: 1.02, margin: 0 });
s.addText("數字來自計算　語言來自 AI　決策留給人", { x: M, y: 4.35, w: 11, h: 0.5, fontFace: HEAD, fontSize: 19, color: C.seafoamOnPhoto, margin: 0 });
s.addText([
  { text: "陽明海運 · 航運物流組", options: { bold: true, color: C.white } },
  { text: "    |    AWS Summit Taipei 2026 百工百業瘋 AI — AI Everywhere Hackathon", options: { color: "AEC4D6" } },
], { x: M, y: 5.9, w: 11.8, h: 0.4, fontFace: BODY, fontSize: 14, margin: 0 });
s.addText("團隊 FleetMind（工程 4 + 簡報 1）", { x: M, y: 6.35, w: 11, h: 0.35, fontFace: BODY, fontSize: 12, color: "8FA8BD", margin: 0 });
s.addNotes(`[0:00–0:30] 開場

講：船舶推進效率隨時間衰退、油耗上升；養護能恢復，但「何時做」靠經驗。
FleetMind 把它變成可計算、可解釋、人可拍板的決策支援。
定位句（整場回扣兩次）：「數字來自計算，語言來自 AI，決策留給人。」

──────── 全場地圖（12 分鐘：8 報告 + 4 Q&A） ────────
 P1  0:00 開場定位          P7  4:25 誠實：baseline 勝出
 P2  0:30 痛點 + 資料規模    P8  5:25 多耗油噸數（不談金額）
 P3  1:10 兩條主線          P9  6:20 限制 + 想要的資料
 P4  1:50 方法 k=FOC/STW³   P10 6:55 架構
 P5  2:35 ★ LIVE DEMO ←唯一離開投影片的一分鐘
 P6  3:35 UWI 誠信          P11 7:35 收尾 → Q&A
 P12–P16 = Q&A 備援頁，被問到才翻（見各頁備忘稿）

──────── 上台前 10 分鐘（缺一不可） ────────
1. 開四個分頁，全在 http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com
   ①/proposal.html（本簡報）②/dashboard.html（demo）③/deck.html（架構深水區）④/architecture.html
2. ★ 在 /dashboard.html 選 S11，按一次「生成 AI 決策簡報」，等它回來。
   這一發是冷的、要 13.5 秒；預熱後台上那發只要 8 秒。不預熱＝觀眾替你付這 13.5 秒，
   而前端 15 秒就放棄 → 簡報可能整個拿不到。
3. 確認 S11 = 21.8%、紅燈「已超門檻」。讀不到數字 → 走演練 B（見 P5 備忘稿）。

超時處置：講完 P8（5:25 那頁）若已過 6:30，直接跳 P11 收尾。寧可少講兩頁。`);

// ---------- Slide 2: problem ----------
s = pptx.addSlide(); lightBg(s);
head(s, "The Problem", "船殼污損每天在偷油——但何時該清，全靠經驗");
s.addText("船殼與螺旋槳污損讓同樣航速要燒更多油。船東靠水下清潔（UWC）與拋光（PP）恢復效能，但「何時做、值不值得、省多少」目前多憑經驗，缺乏可量化、可歸因、可回溯的決策依據。", { x: M, y: 1.75, w: W - 2 * M, h: 0.9, fontFace: BODY, fontSize: 15, color: C.ink, lineSpacingMultiple: 1.15, margin: 0 });
const probStats = [
  { n: "15", u: "艘船 · 5 年", d: "匿名航行日報（noon report）", c: C.teal },
  { n: "21,282", u: "日報列", d: "＋ 77 筆水下養護事件", c: C.teal },
  // fs 22: 這串 11 字在 30pt 下 ≈2.84" > 卡片內寬 2.38" → 會折兩行撞到下面的 u 標籤。
  { n: "-12% ~ +22%", u: "Speed Loss 全隊範圍", d: "從剛養護到重度污損", c: C.coral, fs: 22 },
  { n: "102", u: "格待預測油耗", d: "S21–S23 養護後遮蔽窗格", c: C.amber },
];
probStats.forEach((p, i) => {
  const x = M + i * ((W - 2 * M - 0.4 * 3) / 4 + 0.4), w = (W - 2 * M - 0.4 * 3) / 4;
  card(s, x, 3.0, w, 2.9);
  s.addText(p.n, { x: x + 0.15, y: 3.35, w: w - 0.3, h: 0.9, fontFace: HEAD, fontSize: p.fs || 30, bold: true, color: p.c, valign: "middle", margin: 0 });
  s.addText(p.u, { x: x + 0.15, y: 4.3, w: w - 0.3, h: 0.4, fontFace: BODY, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
  s.addText(p.d, { x: x + 0.15, y: 4.75, w: w - 0.3, h: 0.9, fontFace: BODY, fontSize: 11.5, color: C.mute, lineSpacingMultiple: 1.1, margin: 0 });
});
s.addText("資料由命題企業提供，僅存於競賽 AWS 帳號、不進版控、賽後刪除。", { x: M, y: 6.25, w: W - 2 * M, h: 0.35, fontFace: BODY, fontSize: 11, color: C.mute, margin: 0 });
s.addNotes(`[0:30–1:10] 痛點 + 資料規模

講：船殼與螺旋槳污損讓同樣航速要燒更多油。船東靠水下清潔（UWC）與拋光（PP）恢復效能，
但「何時做、值不值得」目前多憑經驗，缺乏可量化、可歸因、可回溯的依據。

四張卡不要逐一唸，只點兩個：
 · 「15 艘船、5 年、21,282 列日報 + 77 筆養護事件」→ 我們有本錢做量化，不是玩具資料。
 · 「Speed Loss 全隊 −12% ~ +22%」→ 這個跨度就是問題本身：有的剛養護、有的重度污損。
頁尾那句唸出來會加分：「資料由命題企業提供，僅存於競賽 AWS 帳號、不進版控、賽後刪除。」`);

// ---------- Slide 3: what we built (2 deliverables) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "Our Solution", "兩條主線：看得見衰退，算得出代價");
const deliv = [
  { tag: "反事實預測", tagc: C.amber, t: "油耗預測模型", pts: ["預測 102 格被遮蔽的全速油耗", "反事實推論：現在做 UWC/PP 能少燒多少油", "污損時鐘 + 跨姊妹船遷移學習"], foot: "predict/ · Python · sklearn" },
  { tag: "效能診斷", tagc: C.seafoam, t: "Speed Loss Dashboard", pts: ["ISO 19030 框架下的效能衰退趨勢", "船殼 vs 螺旋槳歸因", "養護事件與效能恢復時序對比"], foot: "core-calc + apps/api · Java / Spring Boot" },
];
deliv.forEach((d, i) => {
  const x = i === 0 ? M : W / 2 + 0.2, w = W / 2 - M - 0.2;
  card(s, x, 1.85, w, 3.7);
  chip(s, x + 0.35, 2.15, 1.7, d.tag, d.tagc, i === 0 ? C.navy : C.white);
  s.addText(d.t, { x: x + 0.35, y: 2.65, w: w - 0.7, h: 0.55, fontFace: HEAD, fontSize: 23, bold: true, color: C.navy, margin: 0 });
  s.addText(d.pts.map((p, j) => ({ text: p, options: { bullet: { code: "2022", indent: 14 }, color: C.ink, breakLine: j < d.pts.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.35, y: 3.3, w: w - 0.7, h: 1.5, fontFace: BODY, fontSize: 14, margin: 0 });
  s.addText(d.foot, { x: x + 0.35, y: 5.05, w: w - 0.7, h: 0.35, fontFace: BODY, fontSize: 11, italic: true, color: C.teal, bold: true, margin: 0 });
});
s.addText("兩者共用同一套確定性計算：多耗油量反事實、單服務可維運架構、AI 護欄，皆由此延伸", { x: M, y: 5.85, w: W - 2 * M, h: 0.4, align: "center", fontFace: BODY, fontSize: 13.5, bold: true, color: C.mute, margin: 0 });
s.addNotes(`[1:10–1:50] 兩條主線

講：兩個產出，一句話各帶過——
 · Speed Loss Dashboard → 讓衰退看得見（ISO 19030 框架、船殼 vs 螺旋槳歸因、事件比對）
 · 油耗預測模型 → 讓代價算得出（預測 102 格被遮蔽的全速油耗 + 反事實推論）
關鍵是下一句：「兩者共用同一套確定性計算。」
多耗油量估算、單服務架構、AI guardrail 都是從這個核心長出去的，不是三個獨立功能。`);

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
s.addText("被遮蔽的 3 艘預測船，在同型訓練船上有大量可見歷史 → 遷移學習。", { x: 7.85, y: 6.05, w: 4.9, h: 0.6, fontFace: BODY, fontSize: 11, color: C.seafoam, lineSpacingMultiple: 1.1, margin: 0 });
s.addNotes(`[1:50–2:35] 方法 —— 這頁決定評審信不信你

k = FOC ÷ STW³。慢慢講，這是全場的地基：
 · 用對水速度 STW，不是對地速度 SOG → 洋流（黑潮那種）不會被誤記成效能變化
 · 三次方 → 阻力物理；速度正規化掉，剩下的才是船況
 · 只在 ±1 kn 同速帶內比 k → 商業減速改變的是 V，不改變 k

如果只能講一句：「我們從不比原始油耗，也不比原始航速。」
專家會在 Q&A 追這題（見 P14 備忘稿）。`);

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
s.addText("依 Speed Loss 排序的船隊優先盤點（前 8 名）", { x: M, y: 6.55, w: 7, h: 0.3, fontFace: BODY, fontSize: 11, color: C.mute, margin: 0 });
// right feature list
const feats = [
  ["互動趨勢圖", "點選任一船，看 Speed Loss 隨航程變化、事件標記、資料缺口"],
  ["歸因卡", "每船顯示船殼/螺旋槳佔比、信心等級與樣本數 n"],
  ["Before-After", "養護事件前後 median k 對比與恢復幅度"],
  ["誠實信心", "顯示 ±區間、n、未解釋殘差，不做假精確"],
];
card(s, 8.05, 1.9, W - M - 8.05, 4.6, C.panel);
// 卡片右緣在 W-M=12.633, 文字左緣 8.35 → 內寬上限 4.28。原本 4.3/4.35 會讓行尾壓在卡片邊
// 線上 (Hiragino 比舊 fallback 寬, 更明顯)。收到 3.98 = 左右各留 0.3 padding。
feats.forEach((f, i) => {
  const y = 2.2 + i * 1.05;
  s.addText(f[0], { x: 8.35, y, w: 3.98, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy, margin: 0 });
  s.addText(f[1], { x: 8.35, y: y + 0.34, w: 3.98, h: 0.62, fontFace: BODY, fontSize: 11.5, color: C.mute, lineSpacingMultiple: 1.08, margin: 0 });
});
s.addNotes(`[2:35–3:35] ★ LIVE DEMO — 全場唯一離開投影片的一分鐘

切到分頁②：http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com/dashboard.html
只點這三下。每一下先講「我要證明什麼」，再點。不要即興、不要多點。

① 排名表點 S11
   「15 艘裡最嚴重：速度損失 21.8%、信心 HIGH、已超 10% 門檻、692 天沒清洗。」
   失敗：表沒出來 → 演練 B。

② 看趨勢 ＋ 事件標記線
   「五年慢慢爬上來，撞到門檻。這條垂直線是水下事件——清了，但 k 沒有降回去，
    恢復率 −4.62%。」
   「這不是我們的圖有問題，這是發現。官方也明示：純檢查（UWI）本就不該帶來改善。」
   失敗：圖沒出來 → 講這段話，跳③。

③ 按「生成 AI 決策簡報」← 最有價值也最脆弱，它真的在打 Bedrock
   按下去之後立刻接著講：「數字不是 AI 掰的——每個數字都帶編號上標引用，
    點下去會跳回產生它的 API。」講完它剛好回來。
   ★ 不要盯著轉圈等。實測：預熱過 8 秒／沒預熱 13.5 秒，兩種都會回來。
   ★ 轉圈不是故障訊號，畫面自己跳出「AI 簡報暫不可用」才是。
     最大的風險是你以為壞了、手癢去按「離線備援」，親手把最好的一刻換成英文版。

回扣：「數字全部來自 core-calc 的確定性計算；AI 只負責把它說成人話。」

──────── 演練 A：真的回不來（畫面出現錯誤訊息） ────────
不要重按。講：「這裡有降級階梯：Bedrock → 護欄驗證 → 快取 last-good → 決定性 fallback。
走到哪一階都會有輸出，因為這條路徑設計成不能開天窗。」然後按「離線備援」。
這不是掩飾，這就是設計——講出來反而加分。

──────── 演練 B：全站掛掉／會場網路斷 ────────
不要 debug。切回 /proposal.html，投影片是靜態 JPG。
講：「Live demo 走不了，我用投影片講完，結束後歡迎到攤位實機看。」
（前一晚先把 PPTX 下載到本機，斷網也能放。）

對照船（被問到才講）：S23 8.9%、船殼歸因 96%、信心 HIGH ——「該排清洗」的乾淨案例。
S11 是極端案例（692 天沒清）。`);

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
s.addText("方法：以隔離區段（只影響螺旋槳 / 只影響船殼的窗口）各自量 k 漂移率拆分；區段稀疏時退回標記過的 50/50，不假裝精準。", { x: M + 0.35, y: 5.2, w: 4.9, h: 1.0, fontFace: BODY, fontSize: 11, color: "8FA8BD", lineSpacingMultiple: 1.12, margin: 0 });
// right: UWI honesty
card(s, 6.75, 1.9, W - M - 6.75, 4.5, C.panel);
s.addText("誠實處理「純檢查」事件（UWI）", { x: 7.05, y: 2.15, w: 5.4, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
s.addText([
  { text: "官方提示：純檢查（UWI）不清不拋，不該帶來效能改善。", options: { color: C.ink, breakLine: true, paraSpaceAfter: 10 } },
  { text: "我們的做法 — 兩個地方，兩種角色：", options: { bold: true, color: C.navy, breakLine: true, paraSpaceAfter: 6 } },
  { text: "預測模型：污損時鐘在 UWI 不重置 → 模型不會幻覺出一段恢復（物理先驗放這裡）。", options: { bullet: { code: "2022" }, color: C.ink, breakLine: true, paraSpaceAfter: 6 } },
  { text: "Dashboard：呈現實測 k 變化 + 信心，不宣稱「零變化」（稀疏資料上仍有雜訊，誠實顯示）。", options: { bullet: { code: "2022" }, color: C.ink, breakLine: true } },
], { x: 7.05, y: 2.65, w: 5.4, h: 3.4, fontFace: BODY, fontSize: 12.5, lineSpacingMultiple: 1.12, margin: 0 });
s.addNotes(`[3:35–4:25] UWI 誠信 —— 全場最能拿分的一頁

剛剛 demo 才看到「清了但 k 沒降回去」，趁熱講這頁。

官方明示提示：資料裡有一類事件是純檢查、無實體介入（UWI），
好的模型應辨識這類事件不該帶來效能改善，而不是把「養護後」一律當「變好」。
「官方認證我們這個方向是對的。」

我們的做法是兩個地方、兩種角色（這句要背）：
 · 預測模型裡 → 污損時鐘在 UWI 事件不重置 ← 物理先驗的家
 · Dashboard 裡 → 誠實顯示實測 delta + 信心，不宣稱「UWI = 零變化」

「把統計實測（會有雜訊）和物理先驗（乾淨）分開處理，是刻意的設計。」
評審一定會追問「那你圖上為什麼有變化」→ P15 備忘稿有完整答法。`);

// ---------- Slide 7: prediction model (official item 2 + 4) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ②b + ④　油耗預測模型", "在只給部分特徵下，還原被遮蔽的油耗");
const mstats = [
  { n: "3.51", u: "MT　RMSE", c: C.navy },
  { n: "5.22", u: "%　MAPE", c: C.navy },
  { n: "102/102", u: "格提交 1:1", c: C.seafoam },
];
mstats.forEach((p, i) => {
  // 2.55/2.35 put card 3 at 0.7 + 5.10 + 2.35 = 8.15, and the honesty panel starts at 8.05 —
  // a 0.10" overlap. The panel is drawn after the cards, so it buried card 3's right rounded
  // corner: two cards with round corners and a third squared off mid-air. 2.45/2.25 ends the
  // row at 7.85 and gives the panel the same 0.20" gap the cards give each other.
  const x = M + i * 2.45, w = 2.25;
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
// 同上: 內寬收到 3.98, 否則行尾會壓在卡片右邊線上。
s.addText("刻意的簡單", { x: 8.35, y: 2.1, w: 3.98, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
s.addText("我們試過更複雜的堆疊與單調約束——在防漏驗證上都沒贏過樸素 GBM baseline，於是資料驅動地選 baseline。", { x: 8.35, y: 2.55, w: 3.98, h: 1.3, fontFace: BODY, fontSize: 13, color: C.ink, lineSpacingMultiple: 1.18, margin: 0 });
s.addText("「不 ship 比 baseline 差的模型」是原則，不是能力上限。", { x: 8.35, y: 3.95, w: 3.98, h: 0.9, fontFace: BODY, fontSize: 12, color: C.teal, bold: true, lineSpacingMultiple: 1.15, margin: 0 });
s.addText("提交標的：全速時段油耗總量（MT），以每小時率×全速時數還原。", { x: 8.35, y: 5.0, w: 3.98, h: 0.7, fontFace: BODY, fontSize: 11, color: C.mute, lineSpacingMultiple: 1.1, margin: 0 });
s.addNotes(`[4:25–5:25] 誠實 —— baseline 勝出

三個數字：RMSE 3.51 MT · MAPE 5.22% · 102/102 格 1:1 提交。

這頁的價值不在數字，在右邊那張「刻意的簡單」：
「我們試過更複雜的堆疊與單調約束——在防漏驗證上都沒贏過樸素 GBM baseline，
 於是資料驅動地選 baseline。不 ship 比 baseline 差的模型，是原則，不是能力上限。」

防漏驗證要講，這是評審會追的：
「我們不用隨機 K-fold。在可見船上模擬真實遮蔽——挑真養護事件後的合格日窗把答案藏起來，
 只用可見特徵預測、逐窗評分。等於把預測船會遇到的難處，在有答案的船上重演一次。
 另外跑 GroupKFold(by ship) 確認跨船遷移不是靠記住單船。」`);

// ---------- Slide 8: 多耗燃油噸數（粗估）----------
// 依 docs/27 工程師回饋第 9 點：成本由別部門管，他們只負責「發現問題、通知需要清洗」
// → 主線移除金額與投資回收模型。第 10 點允許估「多耗燃油噸數（噸，不談金額）」但須明標粗估。
s = pptx.addSlide(); darkBg(s);
// A content-dense slide, so the photo is texture rather than subject: a heavy scrim (22)
// keeps the tonnage figures the thing you read. The wake and exhaust are on-message here —
// this page is about the fuel a fouled hull burns.
photoBg(s, "wake-exhaust.jpg", 22);
s.addText("商務決策價值", { x: M, y: 0.5, w: 11, h: 0.3, fontFace: BODY, fontSize: 12, color: C.amber, bold: true, charSpacing: 2, margin: 0 });
s.addText("同一個模型回答：污損正在多燒多少油？", { x: M, y: 0.8, w: 11.8, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: C.white, margin: 0 });
s.addText("反事實推論：把污損時鐘歸零重新預測，得到同航速下每天多耗的燃油噸數。只談噸數，不談金額。", { x: M, y: 1.65, w: 9.1, h: 0.5, fontFace: BODY, fontSize: 14, color: "AEC4D6", margin: 0 });
chip(s, W - M - 2.7, 1.62, 2.7, "粗估 · 非正式數字", C.amber, C.navy);
const roi = [
  ["S23", "24.4%", "16.4 MT/日", "HIGH · n=506"],
  ["S6", "25.1%", "14.8 MT/日", "LOW · 樣本不足"],
  ["S11", "52.3%", "40.1 MT/日", "極端 · 692 天未清"],
];
// table header
const cols = [1.5, 2.6, 3.4, 3.6];
const cx = [M, M + 1.5, M + 4.1, M + 7.5];
const hd = ["船", "可省比例", "每日多耗燃油", "信心"];
card(s, M, 2.4, W - 2 * M, 3.6, C.navy2);
hd.forEach((h2, i) => s.addText(h2, { x: cx[i] + 0.2, y: 2.6, w: cols[i], h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: C.seafoamOnPhoto, margin: 0 }));
roi.forEach((r, ri) => {
  const y = 3.15 + ri * 0.86;
  r.forEach((cell, ci) => {
    const isTons = ci === 2, isPct = ci === 1;
    s.addText(cell, { x: cx[ci] + 0.2, y, w: cols[ci] + 0.3, h: 0.5, fontFace: ci === 0 || isTons ? HEAD : BODY, fontSize: isTons ? 17 : (ci === 0 ? 17 : 14), bold: ci === 0 || isTons || isPct, color: isTons ? C.amber : C.white, valign: "middle", margin: 0 });
  });
});
s.addText("決策支援，非自動指令：低信心→先做便宜的水下檢查；高信心且多耗油量大→建議清潔；最終由輪機主管拍板。", { x: M, y: 6.25, w: W - 2 * M, h: 0.5, fontFace: BODY, fontSize: 12.5, color: "8FA8BD", margin: 0 });
s.addNotes(`[5:25–6:20] 多耗油噸數 —— ★ 這頁有紅線：不准報金額 ★

主打 S23（HIGH 信心、船殼歸因 96%、n=506）：同航速下每天多耗約 16.4 MT。
S11 是極端案例（692 天沒清）。

刻意不出金額，而且要把理由講出來——這是加分不是扣分：
「貴司工程師講得很清楚：成本是別部門管的，你們要的是『發現問題、通知該清洗』。
 所以我們只給物理量。要換算成本，用貴司當期實際油價乘上去即可——
 每港每次加油都不同，我們不假裝知道。」

反事實怎麼來的：同一個預測模型，把船殼／螺旋槳的污損時鐘歸零重新預測，
差值就是「現在做 UWC／PP，同航速下每天少燒多少」。標了「粗估 · 非正式數字」。
收尾：「人在迴路，每個噸數都可回溯到計算。」

★ 超時檢查點：講完這頁若已過 6:30 → 直接跳 P11 收尾。`);

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
  "貴司 UWC/PP 恢復幅度紀錄 → 歸因與多耗油量估算有 ground truth",
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
s.addNotes(`[6:20–6:55] 限制 + 想要的資料

「主動揭露限制，是讓結論可信的前提。」——這句先講，再列。

四點限制（不要念稿，挑兩點講）：
 ①正午報表是 SOG、非 ISO 要的對水速度 → 洋流是系統性偏差
 ②無軸功率，k 是 FOC/STW³ 的代理
 ③船殼/螺旋槳歸因在區段稀疏時退回標記過的 50/50
 ④UWI 事件在真資料上仍有超噪音的量測變化——我們呈現，不壓平

想要的資料（這是官方命題明列要我們回答的一項，別漏）：
軸功率計與對水速度計（直接升級 ISO 19030 全合規）、進塢後海試曲線（更準的參考基準）、
antifouling 塗層年限、吃水俯仰 trim、航線與港口。
以及貴司自己的 UWC/PP 效能恢復幅度紀錄——那能把我們的歸因與反事實
從「合理估計」校準成「有 ground truth 背書」。

收尾：「方法框架不用改，餵進更好的量測就直接升級。」`);

// ---------- Slide 10: architecture + AI role (official item 4 + 5) ----------
s = pptx.addSlide(); lightBg(s);
head(s, "官方必含 ④ 架構 + ⑤ AI 角色", "單服務同源 · AI 只翻譯不發明");
// flow row
const flow = [
  ["S3", "航行/養護資料", C.teal],
  ["core-calc + predict", "確定性計算 + 預測（數字唯一來源）", C.navy],
  ["Spring Boot", "API + Dashboard 同源", C.seafoam],
  ["Bedrock", "Claude Haiku · 決策簡報 · guardrail", C.amber],
];
flow.forEach((f, i) => {
  const w = 2.75, gap = 0.42, x = M + i * (w + gap);
  card(s, x, 2.0, w, 1.5, f[2]);
  s.addText(f[0], { x: x + 0.15, y: 2.2, w: w - 0.3, h: 0.5, fontFace: HEAD, fontSize: 16, bold: true, color: i === 3 ? C.navy : C.white, margin: 0 });
  s.addText(f[1], { x: x + 0.15, y: 2.72, w: w - 0.3, h: 0.7, fontFace: BODY, fontSize: 11, color: i === 3 ? C.navy : "E6EEF5", lineSpacingMultiple: 1.05, margin: 0 });
  if (i < 3) s.addText("▶", { x: x + w + 0.02, y: 2.55, w: 0.38, h: 0.4, align: "center", valign: "middle", fontFace: BODY, fontSize: 16, color: C.line, margin: 0 });
});
s.addText("部署　ECS Fargate（ARM64）· ALB · ECR · Bedrock（Claude Haiku）· SNS · CloudWatch · us-east-1 · Day1 已實測上線", { x: M, y: 3.7, w: W - 2 * M, h: 0.4, fontFace: BODY, fontSize: 12.5, color: C.mute, margin: 0 });
// AI role
card(s, M, 4.3, W - 2 * M, 2.05, C.panel);
s.addText("AI 的角色：數字來自計算，語言來自 AI，決策留給人", { x: M + 0.35, y: 4.5, w: W - 2 * M - 0.7, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, margin: 0 });
s.addText([
  { text: "Bedrock(Claude) 只把已算好的指標改寫成營運語言；guardrail 逐一比對每個數字的引用來源，未引用或引錯即攔下——AI 無法發明數字。", options: { color: C.ink, breakLine: true, paraSpaceAfter: 6 } },
  { text: "失敗降級：Bedrock 不可用 → 該船快取簡報 → deterministic 模板；dashboard 與所有計算數字完全不受影響。開發全程以 Kiro 為 AI 助手。", options: { color: C.ink } },
], { x: M + 0.35, y: 4.95, w: W - 2 * M - 0.7, h: 1.3, fontFace: BODY, fontSize: 12.5, lineSpacingMultiple: 1.15, margin: 0 });
s.addNotes(`[6:55–7:35] 架構

一句話：單服務同源、AWS-only、AI 有護欄不亂編。回應官方要求的第 4、5 項
（AI 與 AWS 服務扮演的角色）。

三個點：
 · ECS Fargate (ARM64) 單一容器同時服務看板與 REST API —— 一個部署單元
 · 請求路徑上沒有資料存放層：指標離線算完烤進映像，冷啟即有真資料、零外部相依
 · Bedrock 只負責語言，數字全部來自 core-calc；護欄比對每個數字的引用，對不上整篇打回

★ 不要把設計講成現況。CloudFront/WAF/Cognito/多區域今天都沒有，
 圖上是灰虛線，講的時候也照講。旁邊就是 live URL，評審 curl 一下就知道。

被追問架構 → 分頁③ /deck.html（18 頁）或分頁④ /architecture.html（可點開放大讀 ARN）。`);

// ---------- Slide 11: close ----------
s = pptx.addSlide(); darkBg(s);
// bookends the cover: same ocean, first light instead of dusk, ship small and far off.
photoBg(s, "horizon-dawn.jpg", 18);   // measured: 40 left the amber kicker at 2.79:1
s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.2, w: W, h: 2.2, fill: { color: C.navy2, transparency: 20 } });
s.addText("FLEETMIND", { x: M, y: 1.5, w: 9, h: 0.4, fontFace: BODY, fontSize: 13, color: C.amber, bold: true, charSpacing: 5, margin: 0 });
s.addText("把船隊的效能衰退，變成可計算、\n可歸因、人可拍板的節能決策", { x: M, y: 2.0, w: 11.6, h: 1.6, fontFace: HEAD, fontSize: 33, bold: true, color: C.white, lineSpacingMultiple: 1.05, margin: 0 });
const closeItems = [
  ["Speed Loss Dashboard", "真資料 15 船 · ISO 19030 · 船殼/螺旋槳歸因"],
  ["油耗預測 102 格", "RMSE 3.51 MT · 防漏驗證 · 反事實多耗油量"],
  ["決策支援 · 人在迴路", "AI 解釋不發明 · 單服務 AWS 架構"],
];
closeItems.forEach((c, i) => {
  const w = (W - 2 * M - 0.6) / 3, x = M + i * (w + 0.3);
  s.addText(c[0], { x, y: 5.35, w, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.seafoamOnPhoto, margin: 0 });
  s.addText(c[1], { x, y: 5.75, w, h: 0.7, fontFace: BODY, fontSize: 11.5, color: "AEC4D6", lineSpacingMultiple: 1.1, margin: 0 });
});
s.addText("謝謝聆聽　·　FleetMind × 陽明海運", { x: M, y: 6.7, w: 11, h: 0.4, fontFace: BODY, fontSize: 13, color: "8FA8BD", margin: 0 });
s.addNotes(`[7:35–8:00] 收尾

三個交付各一句，不要展開：
 · Speed Loss Dashboard —— 衰退看得見
 · 油耗預測模型 —— 102 格 1:1，代價算得出
 · Live 系統 —— 網址就在上面，現在就可以打開

回到定位句收：「數字來自計算，語言來自 AI，決策留給人。」

然後停。把時間留給 Q&A（4 分鐘、統問統答）。
Q&A 路由：
 資料/方法/ISO/洩漏 → P12–P16 備援頁（各頁備忘稿有深度答案）
 架構/為何不用 Serverless → 分頁③ /deck.html 或分頁④ /architecture.html
 資安/權限 → /architecture.html#security（已實作與規劃中分開標）
 多區域/災備 → /architecture.html#activeactive（那是設計不是現況）
 「數字哪來的」 → 直接回 dashboard 點引用，跳回 API

答不出來時的誠信收尾句：
「正午報表粒度下這是最誠實的做法；給我們軸功率／對水速度計資料，
 框架直接升級 ISO 19030 全合規。」`);

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
]).addNotes(`Q&A 備援 · 資料與方法（被問到才翻到這頁）

【4 分鐘 Q&A 是統問統答】評審一次問完，我們分工接。不確定 → 用誠信收尾句（見下）。

■ 訓練/預測怎麼切
訓練船 S1–S12 全可見；預測船 S21–S23 在養護後區間被遮蔽。
船型 W1（S1–S8 + S21）、W2（S9–S12 + S22–S23）——同設計姊妹船、不同航線。

■ 若追問「event_day 是什麼」
官方資料 v2 把 maintenance.csv 從 event_date（日曆）改成 event_day（相對天數，
與日報 NOON_UTC 同軸）。所以 (ship_id, event_day) 直接 join，anchor 難題消失。
這是 7/14 官方重釋出的，我們跟著改了。

■ 若追問「為什麼不用 SOG」
兩欄都 100% 填充，但洋流讓兩者可有明顯差異。阻力物理一律 STW，距離/營運才用 SOG。
殘差顯性標成「未解釋」，不塞進污損。

■ 102 格的分布（被問到細節時才報）
HSHFO 91 格、VLSFO 11 格；S21=43、S22=24、S23=35。

■ 誠信收尾句（答不出來時統一用這句）
「正午報表粒度下這是最誠實的做法；給我們軸功率／對水速度計資料，
 框架直接升級 ISO 19030 全合規。」`);
qaSlide("預測模型", [
  ["用什麼模型？效果多少？", "sklearn；物理 baseline→HistGBM→擇優。最佳為樸素 GBM baseline，模擬遮蔽 RMSE 3.51 MT / MAPE 5.22%。更複雜的沒贏過 → 不上。"],
  ["怎麼確定沒偷看答案？", "不用隨機 K-fold。在可見船上模擬真實遮蔽（事件後合格日窗藏答案再預測、逐窗評分）+ GroupKFold 確認跨船遷移。"],
  ["RPM/SFOC 不是能反推油耗？算洩漏？", "H 類（SFOC/馬力/推力）在預測窗本就遮蔽、不用。ME_AVG_RPM 屬可見運轉條件、非答案代理；使用邊界也列入問主辦。"],
  ["模型有信心區間嗎？", "每格附 ±band（同船型×燃料 slice 的殘差 std）；submission 主檔維持 4 欄 102 列，信心另存輔助檔。"],
]).addNotes(`Q&A 備援 · 預測模型（25% 是這一項，程式自動評分）

■ 這題最容易被追殺：「為什麼不上 SageMaker / 深度學習？」
誠實講三個理由，順序不要換：
 ① ISO 19030 本身就是確定性方法，不是學出來的。
 ② 篩選後每船合格樣本太少，硬煉大模型會過擬合。
 ③ 我們真的試過更複雜的堆疊與單調約束——在防漏驗證上沒贏過樸素 GBM baseline。
「簡單是裁決過的，不是不會做。不 ship 比 baseline 差的模型，是原則。」

■ 特徵清單（被問到才報，不要主動背）
STW / STW³ / RPM / 滑差 · 吃水載況 · 風浪湧與水溫 · 污損時鐘（距上次船殼介入天數、
距上次螺旋槳介入天數、水溫×天數的積溫＝生物污損壓力 proxy）· 船型 W1/W2 ·
燃料類型 + 熱值 LCV · HOURS_FULL_SPEED。

■ 「污損時鐘」是整個模型最關鍵的設計
UWI（純檢查、不清不拋）事件不重置時鐘。所以模型不會在一次純檢查後幻覺出恢復。
這正是官方明示提示要的能力——見 P15 那頁。

■ 若追問洩漏（Q7 級）
H 類主機性能欄位（SFOC / 馬力 / 推力）在預測窗本來就是 HIDDEN，我們不會也不能用。
ME_AVG_RPM 屬 A 類、預測窗可見——它是當日真實觀測的運轉條件，不是油耗的代理答案。
這個使用邊界我們也列進給主辦的問題清單，想跟貴司確認。

■ 數字
RMSE 3.51 MT / MAPE 5.22% / 102 格 1:1 提交。`);
qaSlide("Speed Loss / ISO 19030", [
  ["對齊 ISO 19030 哪個層級？", "noon-report 粒度務實改編，不宣稱全合規。k=FOC/STW³ 當 performance value 代理，骨架照 ISO：定參考期、控速帶、看偏移；偏離四點有明列表。"],
  ["全隊都降速了，怎麼分商業減速與污損？", "從不比原始 FOC/航速。k 先正規化速度，只在同速帶比；基準取事件後首 10–15 合格日、上限 60 天。減速改變 V 不改變 k。"],
  ["Speed Loss % 可信嗎？", "段內對 k 做 Theil-Sen 穩健迴歸（抗離群）；主 KPI 顯示 3.5%（±0.8）· 中信心 · n=12，未解釋殘差一定顯示，不做假精確。"],
  ["船殼 vs 螺旋槳怎麼拆？", "隔離區段各量 k 漂移率拆分；區段稀疏時退回標記過的 50/50，明講『因區段不足暫用預設』，不假裝精準。"],
]).addNotes(`Q&A 備援 · Speed Loss / ISO 19030（30% 是這一項，陽明專家品評）

■ 這頁的評審裡有海事／輪機專家。不要宣稱全合規，先自己講偏離。
偏離 ISO 19030 的四點，主動報：
 ① 正午報表是 SOG 粒度，非 ISO 要的對水速度計 → 洋流是系統性偏差
 ② 無軸功率，k = FOC/STW³ 只是 performance value 的代理
 ③ 正午粒度（一天一筆），非 ISO 的高頻量測
 ④ 無完整天候修正
「骨架照 ISO：定參考基準期、控速度帶、看 performance value 隨時間偏移。
 拿不到的量測我們就說拿不到，不假裝。」

■ 「全隊都降速了，你怎麼分商業減速與污損？」← 專家最愛問這題
從不比原始 FOC 或原始航速。k = FOC/STW³ 先把速度正規化，而且只在 ±1 kn 同速帶內比 k；
速度偏離會自動降低信心等級。基準期取每次事件後首 10–15 個合格日、上限 60 個日曆天，
避免再生長把基準灌水。減速改變的是 V，在這些控制下不改變 k。

■ 「Speed Loss % 這數字可信嗎？」
段內對 k 做 Theil-Sen 穩健迴歸（抗離群）。UI 主 KPI 顯示「3.5%（±0.8）· 中信心 · n=12」，
不是假精確的 3.47%。未解釋殘差一定顯示、不藏。
量級合理性：正常約 2–10%。畫得出 40% 的隊，數字就是壞的。

■ 歸因退回 50/50 時要主動講
「因區段不足，暫用預設分攤」會標在卡片上。這是資料限制不是方法漏洞——
有貴司的 UWC/PP 恢復幅度紀錄當 ground truth，就能校準。

■ 誠信收尾句
「正午報表粒度下這是最誠實的做法；給我們軸功率／對水速度計資料，
 框架直接升級 ISO 19030 全合規。」`);
qaSlide("UWI 判讀 · 商務價值", [
  ["UWI 你說不改善，但圖上有變化？", "兩個地方兩種角色：物理先驗放『預測模型污損時鐘不因 UWI 重置』；dashboard 誠實顯示實測 delta+信心，不硬壓成零。刻意分開統計實測與物理先驗。"],
  ["這系統能幫我省多少？講數字。", "我們刻意不出金額。貴司工程師講得很清楚：成本是別部門管的，你們要的是「發現問題、通知需要清洗」。所以我們只講噸數——反事實把污損時鐘歸零重預測，S23 同航速下每天多耗約 16.4 MT（可省 24.4%，HIGH 信心 · n=506）。這是粗估、非正式數字；要換算成本，用貴司當期實際油價乘上去即可，每港每次加油價格都不同，我們不假裝知道。"],
  ["AI 會自己排清潔嗎？", "不會，決策支援、人拍板。低信心→先做便宜水下檢查；高信心且多耗油量大→建議清潔。反事實是檢視證據，不是自動指令。"],
  ["資料品質差的日子會硬給建議嗎？", "被拒列標原因+品質分；可比樣本不足時不出高信心建議，改建議先做檢查。信心與 n 永遠跟著數字顯示。"],
]).addNotes(`Q&A 備援 · UWI 判讀 · 商務價值

★★ 這頁有一條紅線：不准報金額。★★
docs/27 記錄陽明工程師的明確要求：ROI／成本不用算——成本是別部門管的，
他們只負責「發現問題、通知需要清洗」。台上報金額 = 當著提出這要求的人打臉。
只給噸數。要換算，請他們自己乘當期油價：「每港每次加油都不同，我們不假裝知道。」

■ 「清了為什麼沒改善？你們的圖是不是有問題？」← 幾乎必問
不是問題，是發現。官方明示提示自己也講了：純檢查（UWI）不該帶來改善。
關鍵是講清楚兩個地方、兩種角色，這句話要背起來：
 · 預測模型裡 → 物理先驗的家。污損時鐘在 UWI 事件不重置，
   所以模型不會在純檢查後幻覺出一段恢復。這正是官方要的。
 · Dashboard 裡 → 呈現實測 k 變化 + 信心旗標，
   不宣稱「UWI = 零變化」。
S11 的 recovery_pct = −4.62% 就是照實顯示。

■ 追問：「那你的圖在某些 UWI 上還是有變化，不是自相矛盾？」
不矛盾。真資料上多數 UWI 事件量到的 k 變化仍超過噪音門檻——可能是季節、載況、洋流，
或那次檢查其實伴隨了未記錄的小動作。所以 dashboard 老實呈現「量到的 delta + 信心」，
讓專家自己判讀，不硬壓成零。
「把統計實測（會有雜訊）和物理先驗（乾淨）分開處理，是刻意的設計，不是打架。」

■ 「能幫我省多少錢？」
「我們刻意不出金額。」→ 講反事實：把污損時鐘歸零重新預測，
S23 同航速下每天多耗約 16.4 MT（粗估、非正式數字，HIGH 信心 · n=506）。
「換算成本請用貴司當期實際油價。每個噸數都可回溯到計算。」

■ 「AI 會自己排清潔嗎？」
不會。決策支援，人拍板。分級建議：
 低信心 → 先做水下檢查（最便宜的資訊採購）
 高信心且污損歸因明確 → 建議排清潔
 否則 → 持續觀察
「我們永遠不會說『模型叫你清』，而是把證據、信心、歸因攤在你面前，由輪機主管拍板。」
門檻可調（/api/config/threshold），通道可換（SNS/SES）。`);
qaSlide("AI · AWS · 限制", [
  ["AI 扮演什麼角色？怎麼防亂編數字？", "數字來自計算、語言來自 AI。Bedrock(Claude) 只改寫已算好的指標；guardrail 逐一比對每個數字的引用來源，未引用/引錯即攔——無法發明數字。開發用 Kiro。"],
  ["架構？成本？為何不上 SageMaker？", "單一 Spring Boot 容器：ECS Fargate（ARM64）+ ALB + ECR + Bedrock（Claude Haiku）+ SNS + CloudWatch，帳號 516665228894 · us-east-1，Day1 已實測上線。ARM64 Fargate 成本低、免管 EC2/OS patch。原本評估的 App Runner 本次受帳號權限阻擋（AccessDenied），故走 Fargate。不上 SageMaker：ISO 19030 本身確定性、樣本少硬煉會過擬合，複雜模型也沒贏過 baseline。"],
  ["最大的限制是什麼？（主動揭露）", "①SOG 非對水速度、洋流系統偏差 ②無軸功率、k 是代理 ③歸因稀疏時退 50/50 ④UWI 仍有量測雜訊，呈現而非壓平。都在 UI/偏離表明示。"],
  ["給更多資料會怎麼強化？", "軸功率計+對水速度計→升級 ISO 19030 全合規；海試曲線→更準基準；貴司 UWC/PP 恢復幅度紀錄→歸因與多耗油量估算有 ground truth。框架不改、餵更好量測即升級。"],
]).addNotes(`Q&A 備援 · AI · AWS · 限制

★ 紅線：不要把設計講成現況。旁邊就是 live URL，評審 curl 一下就知道。★
今天真的在跑的只有七個：ALB · ECS Fargate · ECR · Bedrock · SNS · SES v2 · CloudWatch。
CloudFront / WAF / Cognito / 私有子網 / NAT / S3 / DynamoDB / 多區域 —— 今天全都沒有，
每一項都用 boto3 探測過、讀回 0。圖上是灰色虛線，講的時候也照這樣講。

■ 「架構長怎樣？」
單一 Spring Boot 容器跑 ECS Fargate（ARM64）+ ALB + ECR + Bedrock + SNS/SES + CloudWatch。
region us-east-1、帳號 516665228894。
最關鍵也最不尋常的一點：請求路徑上沒有任何資料存放層。
指標由 core-calc 離線算完，real-metrics.json 在 build 時烤進映像 → 容器冷啟即持有真資料、
零外部資料相依。（這也正是多區域今天做不了的原因：沒有外置狀態，就沒有東西可以跨區複製。）
要看細節 → 分頁③ /deck.html（18 頁）或分頁④ /architecture.html。

■ 「成本多少？」
不談月費金額（依 docs/27，成本不是本案主線）。只講質性：ARM64 Fargate 常駐成本低、
免管 EC2/OS patch，全量重算不到一分鐘，擴到近百艘架構不變。

■ 「為什麼不上 SageMaker？」→ 同 P13 備忘稿的三個理由。

■ 「AI 怎麼防它亂編數字？」
「數字來自計算，語言來自 AI，決策留給人。」
Bedrock 上的 Claude 只解讀已經算好的指標。護欄逐一比對簡報裡每個數字與它引用的 metric，
對不上就整篇打回、走降級階梯。它無法發明數字。
簡報裡每個數字可點回產生它的 API —— demo 時就展示過了。
開發階段用 Kiro 當 AI 開發工具。

■ 資安被問到 → /architecture.html#security（已實作與規劃中是分開標的）
不要宣稱「全面最小權限」。真相：IAM 動作有收斂（只有 InvokeModel，不是 bedrock:*）、
SNS 綁單一 topic ARN，但 Bedrock 與 SES 仍是 Resource: *。圖上就是這樣標的，照講。
兩個角色分離（task vs execution）才是真的最小權限成果：應用永遠不能拉映像或碰 log group。

■ 多區域被問到 → /architecture.html#activeactive，那是設計不是現況
而且這個比賽帳號根本做不了：ap-northeast-1 的 ECS/ECR 直接回 AccessDenied（已探測）。

■ 「最大的限制？」主動講，不要等問
①SOG 非對水速度、洋流是系統偏差 ②無軸功率、k 是代理 ③歸因區段稀疏時退回標記過的 50/50
④UWI 事件在真資料上仍有超噪音變化，我們呈現而非壓平。
「主動揭露限制，是讓結論可信的前提。」`);

const out = path.join(__dirname, "fleetmind-proposal-deck.pptx");
await pptx.writeFile({ fileName: out });
console.log("wrote", out);
