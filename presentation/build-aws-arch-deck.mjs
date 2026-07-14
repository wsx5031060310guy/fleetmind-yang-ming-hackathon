#!/usr/bin/env node
// FleetMind — AWS 架構藍圖與方案比較 · 離線生成器 (pptxgenjs, 無私有相依)
// zh-TW · 海事深色主題 · 真實黑客松數字。重生:
//   npm install -g pptxgenjs && NODE_PATH=$(npm root -g) node presentation/build-aws-arch-deck.mjs
//
// 視覺母題 (judge-facing 升級):
//   ① 服務節點 = 圓形類別 badge (色=類別, 短碼=服務) + 圓角卡片, 全 deck 一致
//   ② sonar「聲納 ping」海事符號: 封面大版視覺焦點 / 每頁角落小標記, 重複識別
//   ③ 狀態色碼: seafoam=已上線/正常 · amber=路線圖/注意 · coral=受阻/行動 · navy=中性
//   ④ 架構圖分層 band (存取/入口/執行/AI·通知) + 統一箭頭粗細與端點
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 顏色一律 6 碼 hex、不加 # 不加 alpha (加了會讓 pptx 損壞)
const C = {
  navy: "0A2540", navy2: "12385C", navy3: "1B4D74",
  teal: "1C7293", seafoam: "2A9D8F", seafoamT: "DCEFE9",
  amber: "F4A72B", amberT: "FBE7C2", coral: "E76F51", coralT: "F7DAD1",
  white: "FFFFFF", ink: "18293B", mute: "5A6B7B",
  panel: "F3F7FA", panel2: "E7EFF4", line: "CBD8E2", slate: "8FA8BD",
  dim: "C7D6E4",
};
const HEAD = "Microsoft JhengHei";
const BODY = "Microsoft JhengHei";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pptx.layout = "W"; // 先設 layout 再加投影片
pptx.author = "FleetMind";
pptx.title = "FleetMind — AWS 架構藍圖與方案比較";

const W = 13.333, H = 7.5, M = 0.7, CW = W - 2 * M;
const TOTAL = 13; // 頁碼分母

// 服務類別 → 色 (視覺母題核心)
const CAT = { comp: C.navy3, net: C.teal, stor: C.navy2, ai: C.seafoam, notify: C.coral, data: C.amber, sec: C.mute, block: C.coral, actor: C.slate };

// ---------- helpers (每次呼叫都新建 options 物件, 不共用) ----------
const darkBg = (s) => { s.background = { color: C.navy }; };
const lightBg = (s) => { s.background = { color: C.white }; };

// sonar「ping」海事符號 — 兩環 + 中心點, 全 deck 重複的識別元素
function ping(s, cx, cy, r, ringColor, dotColor) {
  s.addShape(pptx.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { type: "none" }, line: { color: ringColor, width: 1.25 } });
  s.addShape(pptx.ShapeType.ellipse, { x: cx - r * 0.58, y: cy - r * 0.58, w: r * 1.16, h: r * 1.16, fill: { type: "none" }, line: { color: ringColor, width: 1.25 } });
  s.addShape(pptx.ShapeType.ellipse, { x: cx - r * 0.2, y: cy - r * 0.2, w: r * 0.4, h: r * 0.4, fill: { color: dotColor }, line: { type: "none" } });
}

// 頁首角落標記 (每張內容頁一致): 左上 ping + 右上頁碼
function pageMark(s, n, dark = false) {
  ping(s, 0.42, 0.42, 0.15, dark ? C.seafoam : C.teal, dark ? C.amber : C.seafoam);
  s.addText([
    { text: String(n).padStart(2, "0"), options: { color: dark ? C.white : C.navy, bold: true } },
    { text: "  /  " + TOTAL, options: { color: dark ? C.slate : C.slate } },
  ], { x: W - M - 1.5, y: 0.24, w: 1.5, h: 0.3, align: "right", valign: "middle", fontFace: BODY, fontSize: 10, charSpacing: 1, margin: 0 });
}

function head(s, eyebrow, title, titleColor = C.navy) {
  s.addText(eyebrow.toUpperCase(), { x: M, y: 0.62, w: CW - 2, h: 0.3, fontFace: BODY, fontSize: 12, color: C.teal, bold: true, charSpacing: 2, margin: 0 });
  s.addText(title, { x: M, y: 0.9, w: CW, h: 0.7, fontFace: HEAD, fontSize: 27, color: titleColor, bold: true, margin: 0 });
}

function card(s, x, y, w, h, fill = C.panel, radius = 0.09) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: radius, shadow: { type: "outer", color: "9FB2C0", opacity: 0.26, blur: 8, offset: 3, angle: 90 } });
}

function chip(s, x, y, w, txt, fill, tc = C.white, fs = 11, h = 0.34) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: h / 2 });
  s.addText(txt, { x, y, w, h, align: "center", valign: "middle", fontFace: BODY, fontSize: fs, bold: true, color: tc, margin: 0 });
}

// 類別圓形 badge (視覺母題①): 色=類別 · 短碼=服務
function badge(s, cx, cy, code, cat, d = 0.36) {
  const col = CAT[cat] || C.teal;
  const tc = cat === "data" ? C.navy : C.white;
  s.addShape(pptx.ShapeType.ellipse, { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: { color: col }, line: { color: C.white, width: 1.25 } });
  if (code) {
    const fs = code.length >= 3 ? 8 : code.length === 2 ? 9.5 : 12;
    s.addText(code, { x: cx - d / 2, y: cy - d / 2 - 0.01, w: d, h: d, align: "center", valign: "middle", fontFace: HEAD, fontSize: fs, bold: true, color: tc, margin: 0 });
  }
}

// 服務卡 (淺底 + 頂端 badge + 名稱 + 角色小字)
function svcCard(s, x, y, w, h, it) {
  const fill = it.fill || C.panel;
  const dark = fill === C.navy || fill === C.navy2 || fill === C.navy3;
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: dark ? C.navy2 : C.line, width: 1 }, rectRadius: 0.08, shadow: { type: "outer", color: "AEBECB", opacity: 0.22, blur: 6, offset: 2, angle: 90 } });
  badge(s, x + w / 2, y + 0.3, it.code || "", it.cat || "net", 0.36);
  const lc = it.tc || (dark ? C.white : C.navy);
  s.addText(it.label, { x: x + 0.05, y: y + 0.52, w: w - 0.1, h: h - 0.82, align: "center", valign: "middle", fontFace: HEAD, fontSize: it.fs || 11, bold: true, color: lc, lineSpacingMultiple: 0.98, margin: 0 });
  if (it.sub) s.addText(it.sub, { x: x + 0.05, y: y + h - 0.36, w: w - 0.1, h: 0.32, align: "center", valign: "middle", fontFace: BODY, fontSize: 8, color: dark ? C.slate : C.mute, lineSpacingMultiple: 0.94, margin: 0 });
}

// 服務卡 — 水平版 (badge 左 · 名稱+角色右): 給密集架構圖用, 短卡不重疊
function svcCardH(s, x, y, w, h, it) {
  const fill = it.fill || C.panel;
  const dark = fill === C.navy || fill === C.navy2 || fill === C.navy3;
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: dark ? C.navy2 : C.line, width: 1 }, rectRadius: 0.08, shadow: { type: "outer", color: "AEBECB", opacity: 0.22, blur: 6, offset: 2, angle: 90 } });
  badge(s, x + 0.36, y + h / 2, it.code || "", it.cat || "net", 0.42);
  const lc = it.tc || (dark ? C.white : C.navy);
  const tx = x + 0.68, tw = w - 0.78;
  if (it.sub) {
    s.addText(it.label, { x: tx, y: y + 0.05, w: tw, h: h * 0.55 - 0.02, valign: "bottom", align: "left", fontFace: HEAD, fontSize: it.fs || 12, bold: true, color: lc, lineSpacingMultiple: 0.95, margin: 0 });
    s.addText(it.sub, { x: tx, y: y + h * 0.55, w: tw, h: h * 0.45 - 0.03, valign: "top", align: "left", fontFace: BODY, fontSize: 8.5, color: dark ? C.slate : C.mute, lineSpacingMultiple: 0.94, margin: 0 });
  } else {
    s.addText(it.label, { x: tx, y, w: tw, h, valign: "middle", align: "left", fontFace: HEAD, fontSize: it.fs || 12, bold: true, color: lc, margin: 0 });
  }
}

// 統一水平箭頭
function arrowR(s, x, y, w, color = C.teal) {
  s.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: 1.75, endArrowType: "triangle" } });
}
function arrowV(s, x, y, h, color = C.teal) {
  s.addShape(pptx.ShapeType.line, { x, y, w: 0, h, line: { color, width: 1.75, endArrowType: "triangle" } });
}

// 一排服務卡 + 箭頭
function svcRow(s, items, y, boxH, gap = 0.3) {
  const n = items.length;
  const bw = (CW - gap * (n - 1)) / n;
  const centers = [];
  items.forEach((it, i) => {
    const x = M + i * (bw + gap);
    svcCard(s, x, y, bw, boxH, it);
    centers.push(x + bw / 2);
    if (i < n - 1 && it.arrow !== false) arrowR(s, x + bw + 0.03, y + boxH / 2, gap - 0.06);
  });
  return { bw, centers };
}

// 分層 band (架構圖用): 淡色底 + 頂端層標
function layerBand(s, x, y, w, h, label, tint = C.panel2) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: tint }, line: { type: "none" }, rectRadius: 0.1 });
  s.addText(label.toUpperCase(), { x: x + 0.08, y: y + 0.05, w: w - 0.16, h: 0.26, align: "center", fontFace: BODY, fontSize: 9.5, bold: true, color: C.teal, charSpacing: 1, margin: 0 });
}

// 大字資料 callout (視覺母題③)
function callout(s, x, y, w, big, label, color = C.navy, bigFs = 40) {
  s.addText(big, { x, y, w, h: 0.72, align: "center", valign: "middle", fontFace: HEAD, fontSize: bigFs, bold: true, color, margin: 0 });
  s.addText(label, { x, y: y + 0.72, w, h: 0.44, align: "center", valign: "top", fontFace: BODY, fontSize: 10.5, color: C.mute, lineSpacingMultiple: 0.98, margin: 0 });
}

// 優勢 / 取捨 雙欄
function prosCons(s, y, pros, cons) {
  const colW = (CW - 0.5) / 2;
  s.addShape(pptx.ShapeType.roundRect, { x: M, y, w: colW, h: 0.36, fill: { color: C.seafoam }, line: { type: "none" }, rectRadius: 0.06 });
  s.addText("● 優勢", { x: M + 0.15, y, w: colW - 0.3, h: 0.36, valign: "middle", fontFace: HEAD, fontSize: 12, bold: true, color: C.white, margin: 0 });
  s.addText(pros.map((p, j) => ({ text: p, options: { bullet: { code: "2022", indent: 12 }, color: C.ink, breakLine: j < pros.length - 1, paraSpaceAfter: 6 } })), { x: M + 0.1, y: y + 0.5, w: colW - 0.2, h: 1.7, fontFace: BODY, fontSize: 11.5, lineSpacingMultiple: 1.05, margin: 0 });
  const cx = M + colW + 0.5;
  s.addShape(pptx.ShapeType.roundRect, { x: cx, y, w: colW, h: 0.36, fill: { color: C.coral }, line: { type: "none" }, rectRadius: 0.06 });
  s.addText("▲ 取捨 / 風險", { x: cx + 0.15, y, w: colW - 0.3, h: 0.36, valign: "middle", fontFace: HEAD, fontSize: 12, bold: true, color: C.white, margin: 0 });
  s.addText(cons.map((p, j) => ({ text: p, options: { bullet: { code: "2022", indent: 12 }, color: C.ink, breakLine: j < cons.length - 1, paraSpaceAfter: 6 } })), { x: cx + 0.1, y: y + 0.5, w: colW - 0.2, h: 1.7, fontFace: BODY, fontSize: 11.5, lineSpacingMultiple: 1.05, margin: 0 });
}

// 底部「何時選」帶
function whenBand(s, txt) {
  s.addShape(pptx.ShapeType.roundRect, { x: M, y: 6.55, w: CW, h: 0.62, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.08 });
  s.addText([
    { text: "◆ 何時選　", options: { bold: true, color: C.amber } },
    { text: txt, options: { color: C.white } },
  ], { x: M + 0.28, y: 6.55, w: CW - 0.5, h: 0.62, valign: "middle", fontFace: BODY, fontSize: 11.5, lineSpacingMultiple: 1.0, margin: 0 });
}

// 右上 成本 / 適配 徽章
function tierBadges(s, cost, fit, fitColor = C.seafoam) {
  const lightFit = fitColor === C.amberT || fitColor === C.coralT || fitColor === C.seafoamT;
  chip(s, W - M - 4.55, 0.62, 2.15, "成本 " + cost, C.navy2, C.white, 10.5);
  chip(s, W - M - 2.3, 0.62, 2.3, "黑客松 " + fit, fitColor, lightFit ? C.ink : C.white, 10.5);
}

/* ========================= Slide 1 — 封面 ========================= */
let s = pptx.addSlide(); darkBg(s);
// 底部深色帶
s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 2.15, w: W, h: 2.15, fill: { color: C.navy2 }, line: { type: "none" } });
// 右側 hero: sonar ping + k=FOC/STW³ 公式視覺焦點
ping(s, 10.35, 2.55, 1.35, C.navy3, C.navy3);
ping(s, 10.35, 2.55, 0.9, C.teal, C.navy3);
s.addShape(pptx.ShapeType.roundRect, { x: 8.35, y: 1.5, w: 4.05, h: 2.55, fill: { color: C.navy2 }, line: { color: C.navy3, width: 1 }, rectRadius: 0.12, shadow: { type: "outer", color: "05121F", opacity: 0.5, blur: 12, offset: 4, angle: 90 } });
s.addText("k =", { x: 8.55, y: 1.5, w: 1.2, h: 2.55, align: "center", valign: "middle", fontFace: HEAD, fontSize: 40, bold: true, color: C.white, margin: 0 });
s.addText("FOC", { x: 9.65, y: 1.8, w: 2.5, h: 0.66, align: "center", valign: "middle", fontFace: HEAD, fontSize: 30, bold: true, color: C.seafoam, margin: 0 });
s.addShape(pptx.ShapeType.line, { x: 9.75, y: 2.55, w: 2.3, h: 0, line: { color: C.white, width: 2 } });
s.addText("STW³", { x: 9.65, y: 2.62, w: 2.5, h: 0.66, align: "center", valign: "middle", fontFace: HEAD, fontSize: 30, bold: true, color: C.amber, margin: 0 });
s.addText("ISO 19030 · 船體效能指標", { x: 8.45, y: 3.5, w: 3.85, h: 0.4, align: "center", fontFace: BODY, fontSize: 11, color: C.slate, margin: 0 });
// 左側標題群
s.addText("FLEETMIND · AWS ARCHITECTURE", { x: M, y: 1.15, w: 7.4, h: 0.4, fontFace: BODY, fontSize: 13.5, color: C.amber, bold: true, charSpacing: 4, margin: 0 });
s.addText("AWS 架構藍圖\n與五種上雲路徑", { x: M, y: 1.6, w: 7.5, h: 1.7, fontFace: HEAD, fontSize: 40, color: C.white, bold: true, lineSpacingMultiple: 1.02, margin: 0 });
s.addText("一套船舶效能決策系統 — 從已上線的 Fargate demo 到全艦隊營運平台", { x: M, y: 3.45, w: 7.5, h: 0.7, fontFace: HEAD, fontSize: 15.5, color: C.seafoam, lineSpacingMultiple: 1.1, margin: 0 });
s.addText("數字來自計算　語言來自 AI　決策留給人", { x: M, y: 4.35, w: 7.5, h: 0.5, fontFace: HEAD, fontSize: 16, color: C.amber, italic: true, margin: 0 });
// 底部 資料 callout 帶 (已驗證數字)
const cov = [
  ["15 艘 × 5 年", "同型船 · 2021–2025 正午報表"],
  ["21.8%", "S11 最嚴重 Speed Loss · 539 有效日"],
  ["Day1 上線", "帳號 516665228894 · us-east-1"],
];
cov.forEach((f, i) => {
  const x = M + i * 3.95;
  s.addText(f[0], { x, y: 5.55, w: 3.85, h: 0.55, fontFace: HEAD, fontSize: 24, bold: true, color: C.white, margin: 0 });
  s.addText(f[1], { x, y: 6.12, w: 3.85, h: 0.4, fontFace: BODY, fontSize: 11, color: C.slate, margin: 0 });
});
s.addShape(pptx.ShapeType.line, { x: M + 3.75, y: 5.62, w: 0, h: 0.85, line: { color: C.navy3, width: 1 } });
s.addShape(pptx.ShapeType.line, { x: M + 7.7, y: 5.62, w: 0, h: 0.85, line: { color: C.navy3, width: 1 } });
s.addText([
  { text: "Live　", options: { bold: true, color: C.amber } },
  { text: "http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com", options: { color: C.seafoam } },
], { x: M, y: 6.78, w: 12, h: 0.4, fontFace: BODY, fontSize: 12.5, bold: true, margin: 0 });
s.addNotes("開場：FleetMind 用陽明 15 艘同型船 5 年正午報表，依 ISO 19030 (k=FOC/STW³) 偵測船體污損造成的 Speed Loss，做節能決策支援。最嚴重的 S11 有 21.8% Speed Loss（539 有效日）。這份簡報聚焦 AWS 架構：現行已在帳號 516665228894 / us-east-1 上線，並比較五種上雲方案的取捨。");

/* ================= Slide 2 — 一頁看懂 ================= */
s = pptx.addSlide(); lightBg(s); pageMark(s, 2);
head(s, "One-Pager", "一頁看懂：一個命題、一套現行架構、五種方案");
// 命題帶
card(s, M, 1.62, CW, 1.08, C.navy);
s.addText([
  { text: "命題　", options: { bold: true, color: C.amber } },
  { text: "15 艘同型船、5 年正午報表，依 ISO 19030 以 k=FOC/STW³ 偵測船體污損 Speed Loss，把「何時清、值不值、省多少」變成可計算、可解釋、人可拍板的決策支援。", options: { color: C.white } },
], { x: M + 0.35, y: 1.62, w: CW - 0.7, h: 1.08, valign: "middle", fontFace: BODY, fontSize: 14, lineSpacingMultiple: 1.15, margin: 0 });
// 現行架構一句話
s.addText("現行架構（已部署）", { x: M, y: 2.92, w: CW, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy, margin: 0 });
svcRow(s, [
  { label: "ECS Fargate", sub: "ARM64 容器", code: "F", cat: "comp" },
  { label: "ALB", sub: "靜態 URL", code: "ALB", cat: "net" },
  { label: "ECR", sub: "映像倉庫", code: "ECR", cat: "stor" },
  { label: "Bedrock", sub: "Claude Haiku", code: "AI", cat: "ai" },
  { label: "SNS", sub: "告警扇出", code: "SNS", cat: "notify" },
], 3.3, 0.85, 0.28);
// 五案存在
s.addText("五種上雲方案", { x: M, y: 4.42, w: CW, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy, margin: 0 });
const optsOne = [
  ["A", "現行強化", "Fargate + ALB", C.seafoam],
  ["B", "全 Serverless", "APIGW + Lambda", C.teal],
  ["C", "App Runner", "零 infra（受阻）", C.mute],
  ["D", "EC2 + Docker", "最省保底", C.navy3],
  ["E", "資料分析管線", "S3 + BI + ML 未來式", C.amber],
];
const owN = optsOne.length, owGap = 0.3, owW = (CW - owGap * (owN - 1)) / owN;
optsOne.forEach((o, i) => {
  const x = M + i * (owW + owGap);
  card(s, x, 4.82, owW, 1.5, C.panel);
  s.addShape(pptx.ShapeType.ellipse, { x: x + owW / 2 - 0.3, y: 4.97, w: 0.6, h: 0.6, fill: { color: o[3] }, line: { color: C.white, width: 1.5 } });
  s.addText(o[0], { x: x + owW / 2 - 0.3, y: 4.97, w: 0.6, h: 0.6, align: "center", valign: "middle", fontFace: HEAD, fontSize: 24, bold: true, color: o[3] === C.amber ? C.navy : C.white, margin: 0 });
  s.addText(o[1], { x: x + 0.05, y: 5.66, w: owW - 0.1, h: 0.35, align: "center", fontFace: HEAD, fontSize: 12.5, bold: true, color: C.navy, margin: 0 });
  s.addText(o[2], { x: x + 0.05, y: 5.99, w: owW - 0.1, h: 0.32, align: "center", fontFace: BODY, fontSize: 10, color: C.mute, margin: 0 });
});
s.addText("A 是已上線基準線；E 是全艦隊願景路線圖；B / C / D 是中間的取捨光譜。", { x: M, y: 6.5, w: CW, h: 0.35, align: "center", fontFace: BODY, fontSize: 11.5, italic: true, color: C.mute, margin: 0 });
s.addNotes("這頁一次看懂：上方命題、中間現行五個核心服務、下方五種方案的定位。A 現行強化最穩、B Serverless 最雲原生、C App Runner 受帳號權限阻擋、D EC2 最省最保底、E 資料分析管線是企業級願景藍圖。");

/* ================= Slide 3 — 現行架構 (deployed) ================= */
s = pptx.addSlide(); lightBg(s); pageMark(s, 3);
head(s, "Deployed · Day1 實測上線", "現行架構：ECS Fargate + ALB 單服務容器");
tierBadges(s, "低", "★ 最高", C.seafoam);
// 分層 band (存取 / 入口 / 執行·映像 / AI·通知)
const bY = 1.62, bH = 2.15;
const z1 = M, z1w = 2.15;
const z2 = z1 + z1w + 0.22, z2w = 1.95;
const z3 = z2 + z2w + 0.22, z3w = 2.75;
const z4 = z3 + z3w + 0.22, z4w = W - M - z4;
layerBand(s, z1, bY, z1w, bH, "存取", C.panel2);
layerBand(s, z2, bY, z2w, bH, "入口", C.panel2);
layerBand(s, z3, bY, z3w, bH, "執行 · 映像", C.seafoamT);
layerBand(s, z4, bY, z4w, bH, "AI · 通知", C.amberT);
// 卡片 (水平版, 短卡不重疊)
const rowY = bY + 0.42;
svcCardH(s, z1 + 0.15, rowY + 0.35, z1w - 0.3, 0.85, { label: "評審 / 瀏覽器", sub: "HTTP 請求", code: "GET", cat: "actor", fs: 11.5 });
svcCardH(s, z2 + 0.12, rowY + 0.35, z2w - 0.24, 0.85, { label: "ALB", sub: "靜態 URL", code: "ALB", cat: "net" });
svcCardH(s, z3 + 0.15, rowY, z3w - 0.3, 0.8, { label: "ECS Fargate", sub: "ARM64 · :8080", code: "F", cat: "comp", fs: 11.5 });
svcCardH(s, z3 + 0.15, rowY + 1.0, z3w - 0.3, 0.62, { label: "ECR", sub: "映像 · 資料烤入", code: "ECR", cat: "stor" });
svcCardH(s, z4 + 0.12, rowY, z4w - 0.24, 0.72, { label: "Bedrock · Claude Haiku", sub: "Converse · guardrail 驗 cited 數值", code: "AI", cat: "ai" });
svcCardH(s, z4 + 0.12, rowY + 0.9, z4w - 0.24, 0.72, { label: "SNS · fleetmind-alerts", sub: "告警扇出", code: "SNS", cat: "notify" });
// 箭頭
arrowR(s, z1 + z1w - 0.13, rowY + 0.78, 0.4);
arrowR(s, z2 + z2w - 0.1, rowY + 0.78, 0.4);
arrowV(s, z3 + z3w / 2, rowY + 0.98, -0.16, C.amber); // ECR → Fargate 上
arrowR(s, z3 + z3w - 0.13, rowY + 0.4, 0.4); // Fargate → Bedrock
arrowR(s, z3 + z3w - 0.13, rowY + 1.2, 0.4); // Fargate → SNS
// 支撐層 chips
chip(s, M, 4.02, 5.85, "IAM　exec role 拉 ECR · task role 授 Bedrock + SNS", C.navy2, C.white, 10, 0.4);
chip(s, M + 6.05, 4.02, CW - 6.05, "CloudWatch Logs　/fleetmind/api", C.navy2, C.white, 10, 0.4);
// 下方雙欄: 資料流 / 為什麼選它
const y1 = 4.62, colW = (CW - 0.5) / 2;
card(s, M, y1, colW, 2.35, C.panel);
s.addText("資料流", { x: M + 0.25, y: y1 + 0.16, w: colW - 0.5, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy, margin: 0 });
s.addText([
  "離線　core-calc 讀 15 船 2021–2025 正午報表，跑 ISO 19030 k 與品質旗標 → MetricsExportCli 產 real-metrics.json",
  "Build　Dockerfile COPY real-metrics.json 一起打包 jar → 推 ECR",
  "Runtime　評審 → ALB → Fargate 回決策看板 + REST（/fleet/summary、/vessels/{id}/decision、/config/threshold…）",
  "AI 簡報　/ai-brief → Bedrock Converse → guardrail 驗 cited 數值",
  "告警　門檻跨越 → /alerts/notify → SNS Publish",
].map((p, j, a) => ({ text: p, options: { bullet: { code: "2022", indent: 12 }, color: C.ink, breakLine: j < a.length - 1, paraSpaceAfter: 5 } })), { x: M + 0.25, y: y1 + 0.52, w: colW - 0.45, h: 1.75, fontFace: BODY, fontSize: 10.5, lineSpacingMultiple: 1.0, margin: 0 });
const rx = M + colW + 0.5;
card(s, rx, y1, colW, 2.35, C.navy);
s.addText("為什麼是它 — demo 風險最低", { x: rx + 0.25, y: y1 + 0.16, w: colW - 0.5, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.amber, margin: 0 });
s.addText([
  "單一部署單元、單一 codebase，3 天內最好 debug 與彩排",
  "資料烤進映像＝零外部資料相依，冷啟即有真資料（repo 不含企業資料）",
  "ALB 給穩定 URL，task 重啟換 IP 不會讓 live demo 連結失效",
  "Bedrock + SNS 已實測打通，Email 告警與可調門檻需求已滿足",
  "ARM64 Fargate 成本低、免管 EC2 / OS patch",
].map((p, j, a) => ({ text: p, options: { bullet: { code: "2022", indent: 12 }, color: C.white, breakLine: j < a.length - 1, paraSpaceAfter: 5 } })), { x: rx + 0.25, y: y1 + 0.52, w: colW - 0.45, h: 1.75, fontFace: BODY, fontSize: 11, lineSpacingMultiple: 1.02, margin: 0 });
s.addNotes("現行架構 Day1 已實測上線：Spring Boot 單服務同時服務 vanilla-JS 看板與 REST API，資料 build 時烤進映像，跑在 ECS Fargate(ARM64)，前置 ALB 給穩定 URL，Bedrock 出 AI 簡報並過 guardrail，SNS 發告警。選它的理由是 3 天黑客松下 demo 風險最低、可交付性最高。");

/* ============ Slides 4–8 — 方案 A~E ============ */
function optionSlide(cfg, pageNum) {
  const sl = pptx.addSlide(); lightBg(sl); pageMark(sl, pageNum);
  head(sl, cfg.eyebrow, cfg.title);
  tierBadges(sl, cfg.cost, cfg.fit, cfg.fitColor);
  sl.addText(cfg.summary, { x: M, y: 1.62, w: CW, h: 0.62, fontFace: BODY, fontSize: 12, color: C.mute, italic: true, lineSpacingMultiple: 1.1, margin: 0 });
  sl.addText("服務組成", { x: M, y: 2.32, w: CW, h: 0.3, fontFace: HEAD, fontSize: 13, bold: true, color: C.navy, margin: 0 });
  svcRow(sl, cfg.services, 2.66, 1.0, cfg.services.length > 5 ? 0.22 : 0.3);
  prosCons(sl, 4.0, cfg.pros, cfg.cons);
  whenBand(sl, cfg.whenToChoose);
  sl.addNotes(cfg.notes);
  return sl;
}

// 方案 A
optionSlide({
  eyebrow: "方案 A · 現行強化版",
  title: "維持 Fargate + ALB + Bedrock + SNS",
  cost: "低", fit: "★ 最高", fitColor: C.seafoam,
  summary: "沿用現行單服務容器，把 demo 臨時做法收斂為正式 ECS Service（desiredCount 維持、健檢失敗自動重拉）。評審計分板上可交付性最高、demo 風險最低的基準線。",
  services: [
    { label: "ECS Service\n+ Fargate", sub: "常駐 · 自動重拉", code: "F", cat: "comp", fs: 10.5 },
    { label: "ALB", sub: "靜態 URL", code: "ALB", cat: "net" },
    { label: "ECR", sub: "arm64 映像", code: "ECR", cat: "stor" },
    { label: "Bedrock", sub: "Claude Haiku", code: "AI", cat: "ai" },
    { label: "SNS", sub: "告警", code: "SNS", cat: "notify" },
    { label: "CloudWatch\nAlarms", sub: "日誌 + 健康", code: "CW", cat: "sec", fs: 10.5 },
  ],
  pros: ["與已上線架構一致，Day3 重跑成本最低、最可靠", "單 codebase 好維護、好彩排", "ALB 靜態 URL 解決臨時 IP 問題", "Bedrock / SNS 已實測，Email + 門檻需求即刻滿足"],
  cons: ["非資料驅動，更新資料要重 build / 重部署", "無 BI 自助分析層", "VPC / ALB / 雙 IAM 設定較多，臨時憑證到期需重跑", "架構創新度普通，技術 / 創意分不突出"],
  whenToChoose: "首要目標是穩穩 demo、時間有限、要把工程師的 Email／告警／可調門檻需求確定交付時的預設選擇。",
  notes: "方案 A 是現行架構的正式化：把 demo 臨時做法收斂為 ECS Service 常駐 + 健檢自動重拉。它與已上線一致、可靠度最高，是安全出賽的基準線。代價是非資料驅動、無 BI、創新分普通。",
}, 4);

// 方案 B
optionSlide({
  eyebrow: "方案 B · 全 Serverless",
  title: "API Gateway + Lambda + DynamoDB（資料驅動）",
  cost: "極低", fit: "中", fitColor: C.amberT,
  summary: "把單服務拆成 API Gateway + Lambda 後端、S3 托管前端與原始報表、DynamoDB 存 metrics 與門檻、EventBridge 排程重算。零常駐、按呼叫計費、天生資料驅動。",
  services: [
    { label: "API\nGateway", sub: "HTTP API 入口", code: "API", cat: "net", fs: 10.5 },
    { label: "Lambda\nJava 21", sub: "無狀態運算", code: "λ", cat: "comp", fs: 10.5 },
    { label: "S3", sub: "靜態站 + raw 報表", code: "S3", cat: "stor" },
    { label: "DynamoDB", sub: "metrics / 門檻", code: "DB", cat: "stor" },
    { label: "EventBridge", sub: "排程重算", code: "EVT", cat: "net" },
    { label: "Bedrock", sub: "AI 簡報", code: "AI", cat: "ai" },
    { label: "SES / SNS", sub: "Email 告警", code: "SES", cat: "notify" },
  ],
  pros: ["天生資料驅動：新報表進 S3 自動重算，命中 15→97 艘敘事", "按呼叫計費、零閒置成本、自動擴縮", "EventBridge 排程 + SES Email 直接命中告警需求", "各 handler 解耦，單點改動不動全局"],
  cons: ["monolith 拆多 Lambda + IaC，3 天工作量與整合風險大增", "Java Lambda 冷啟延遲可能拖慢 demo 首打", "本機難完整重現 APIGW+Lambda+DynamoDB，除錯較難", "元件變多，臨時憑證下佈署面更廣、易出錯"],
  whenToChoose: "要強調資料驅動、自動擴縮與『15→97 艘同架構』，且團隊有把握在時限內完成拆分與整合時。",
  notes: "方案 B 最雲原生：拆成 API Gateway + Lambda + DynamoDB + S3 + EventBridge，天生資料驅動、零閒置成本，擴展敘事最強。但 3 天拆分工作量大、Java Lambda 冷啟風險、本機難重現，適合有餘力衝技術分時。",
}, 5);

// 方案 C
optionSlide({
  eyebrow: "方案 C · App Runner",
  title: "全託管容器，零 infra（本次受帳號權限阻擋）",
  cost: "低-中", fit: "低 · 受阻", fitColor: C.coralT,
  summary: "同一顆 Spring Boot 映像改由 App Runner 從 ECR 拉起，AWS 全託管 HTTPS / 負載平衡 / 自動擴縮，免自建 ALB/VPC/SG。惟本 workshop 帳號 App Runner 實測 AccessDenied，只能列對照。",
  services: [
    { label: "App Runner", sub: "全託管 · HTTPS", code: "AR", cat: "block" },
    { label: "ECR", sub: "同一顆 arm64 映像", code: "ECR", cat: "stor" },
    { label: "Bedrock", sub: "AI 簡報", code: "AI", cat: "ai" },
    { label: "SNS", sub: "告警", code: "SNS", cat: "notify" },
    { label: "IAM", sub: "access / instance role", code: "IAM", cat: "sec" },
  ],
  pros: ["管理面最少：免 ALB/VPC/SG/target group，設定步驟最短", "沿用同一映像與 codebase，遷移成本近零", "內建 HTTPS + 穩定網域 + 自動擴縮，demo URL 天生穩定", "維持單服務好除錯特性"],
  cons: ["本 workshop 帳號 App Runner AccessDenied → 決定性阻斷", "與 Fargate 一樣非資料驅動、更新要重 build 映像", "客製網路 / 私有子網彈性不如 ECS", "區域 / 映像限制較多，遇權限問題無替代路徑"],
  whenToChoose: "帳號放行 App Runner、想用最少 infra 步驟托管同一顆容器、不想碰 ALB/VPC 時（本次因 AccessDenied 不建議作主線）。",
  notes: "方案 C 架構上最省心：同一顆映像交給 App Runner 全託管，免碰 ALB/VPC。但本 workshop 帳號實測 App Runner 被 AccessDenied，是決定性阻斷，故只能列為對照 / 賽後方案。",
}, 6);

// 方案 D
optionSlide({
  eyebrow: "方案 D · EC2 + Docker",
  title: "單台虛機 docker run，最省最可控的保底路線",
  cost: "最低", fit: "中 · 保底", fitColor: C.amberT,
  summary: "開一台 EC2（Graviton t4g / x86），docker run 同一顆映像，綁 Elastic IP 得固定位址，安全群組開 8080/443。完全掌控 OS / 網路 / 生命週期，成本壓到最低，無託管服務依賴。",
  services: [
    { label: "EC2\nGraviton", sub: "docker run 容器", code: "EC2", cat: "comp", fs: 10.5 },
    { label: "Elastic IP", sub: "固定公網位址", code: "IP", cat: "net" },
    { label: "ECR /\n本機映像", sub: "pull 或 docker load", code: "ECR", cat: "stor", fs: 10.5 },
    { label: "Security\nGroup", sub: "開 8080/443", code: "SG", cat: "sec", fs: 10.5 },
    { label: "Bedrock", sub: "instance role", code: "AI", cat: "ai" },
    { label: "SNS", sub: "告警", code: "SNS", cat: "notify" },
  ],
  pros: ["成本最低、最可控：一台機器全包，無託管服務加價", "Elastic IP 給固定位址，重啟不換 IP", "本機 docker 行為與 EC2 幾乎一致，除錯最直覺", "無 App Runner/ALB 權限依賴，帳號 EC2 已實測可用"],
  cons: ["要自管 OS patch / Docker / 重啟 / 健康監控，無自動復原", "單台＝單點故障，掛了 demo 就斷（需手動重拉）", "HTTPS 要自己配（反代 / 憑證），比 ALB 麻煩", "非資料驅動、無自動擴縮，擴展敘事最弱"],
  whenToChoose: "要極致省成本、完全掌控，或托管服務權限受阻時，需要一條一定跑得起來的保底部署。",
  notes: "方案 D 是保底路線：一台 EC2 + Docker + Elastic IP，最省最可控，且帳號 EC2 已實測可用，是 ALB/App Runner 都受阻時一定跑得起來的後手。代價是自管 OS、單點故障、HTTPS 要自己配。",
}, 7);

// 方案 E
optionSlide({
  eyebrow: "方案 E · 完整資料分析管線（未來式）",
  title: "S3 Lake → ETL → Athena/Timestream → App + BI + ML",
  cost: "中高", fit: "低 · 藍圖高", fitColor: C.amberT,
  summary: "企業級藍圖：正午報表落 S3 data lake，Glue/Lambda ETL 清洗換算，Athena（批量）/ Timestream（時序）查詢，App 供決策看板，QuickSight 自助 BI，Bedrock/SageMaker 預測，未來接 IoT Core 收船端遙測。",
  services: [
    { label: "S3\nData Lake", sub: "raw / curated", code: "S3", cat: "stor", fs: 10.5 },
    { label: "Glue /\nLambda ETL", sub: "ISO 19030 換算", code: "ETL", cat: "data", fs: 10.5 },
    { label: "Athena /\nTimestream", sub: "SQL / 時序", code: "SQL", cat: "data", fs: 10.5 },
    { label: "Spring\nBoot App", sub: "決策看板", code: "APP", cat: "comp", fs: 10.5 },
    { label: "QuickSight", sub: "自助 BI", code: "BI", cat: "data" },
    { label: "Bedrock /\nSageMaker", sub: "簡報 + 預測", code: "ML", cat: "ai", fs: 10.5 },
    { label: "IoT Core", sub: "未來遙測", code: "IoT", cat: "net" },
  ],
  pros: ["最完整企業級藍圖，命中『企業資料應用說明』與 15→97 艘擴展敘事", "資料驅動 + BI 自助分析 + 預測 + 即時遙測，商用與願景分最高", "S3 單一資料源、分層清晰，符合資料治理與封存要求", "Athena/Timestream/QuickSight 全託管，長期可營運"],
  cons: ["元件最多、整合最重，3 天內不可能全做完，只能藍圖 + 局部 PoC", "SageMaker / IoT Core 屬 stretch，現場跑真流程風險高", "多查詢 / BI 層學習與設定成本高，易在時限內卡住", "過度工程對 hackathon 反而稀釋 demo 焦點"],
  whenToChoose: "要在簡報中展示從 hackathon demo 到全艦隊營運平台的完整演進路線圖、拿商用價值與願景分，而非現場實跑時。",
  notes: "方案 E 是企業級願景藍圖：S3 data lake + Glue ETL + Athena/Timestream + QuickSight BI + Bedrock/SageMaker 預測 + 未來 IoT Core 遙測。它不宜當 Day3 實跑主線，但作為架構故事線與企業資料應用說明極具說服力。",
}, 8);

/* ================= Slide 9 — 五案比較表 ================= */
s = pptx.addSlide(); lightBg(s); pageMark(s, 9);
head(s, "Side-by-Side", "五案比較 — 現行方案 A 為出賽基準線");
const thO = { fill: C.navy, color: C.white, bold: true, align: "center", valign: "middle", fontSize: 11.5, fontFace: HEAD };
const cel = (t, opt = {}) => ({ text: t, options: { fontFace: BODY, fontSize: 10.5, color: C.ink, valign: "middle", align: "center", margin: 2, ...opt } });
const hi = { fill: C.seafoamT };
const rows = [
  [{ text: "方案", options: thO }, { text: "運算", options: thO }, { text: "入口 / URL", options: thO }, { text: "閒置成本", options: thO }, { text: "維運", options: thO }, { text: "冷啟", options: thO }, { text: "黑客松適配", options: thO }],
  [cel("A 現行 ★", { bold: true, color: C.navy, ...hi }), cel("ECS Fargate 容器常駐", hi), cel("ALB 靜態 URL", hi), cel("低（小時費）", hi), cel("中（VPC/IAM）", hi), cel("無冷啟（常駐）", hi), cel("★ 最高 · 已上線", { bold: true, color: C.seafoam, ...hi })],
  [cel("B Serverless", { bold: true, color: C.navy }), cel("Lambda 按呼叫"), cel("API Gateway"), cel("極低（近零）", { color: C.seafoam }), cel("中（元件多）"), cel("冷（Java Lambda）", { color: C.coral }), cel("中", { color: C.amber })],
  [cel("C App Runner", { bold: true, color: C.navy }), cel("全託管容器"), cel("App Runner HTTPS"), cel("低-中"), cel("最低（免 ALB/VPC）", { color: C.seafoam }), cel("無冷啟"), cel("低 · 帳號受阻", { color: C.coral, bold: true })],
  [cel("D EC2+Docker", { bold: true, color: C.navy }), cel("單台 EC2 常駐"), cel("Elastic IP"), cel("最低（單台）", { color: C.seafoam }), cel("高（自管/單點）", { color: C.coral }), cel("無冷啟"), cel("中 · 保底", { color: C.amber })],
  [cel("E 資料管線", { bold: true, color: C.navy }), cel("Fargate + Glue/Athena"), cel("App / QuickSight"), cel("中高（掃描+授權）", { color: C.coral }), cel("高（多層）", { color: C.coral }), cel("—"), cel("低 · 藍圖價值高", { color: C.amber })],
];
s.addTable(rows, {
  x: M, y: 1.7, w: CW, colW: [1.55, 2.15, 1.95, 1.6, 1.75, 1.7, 1.23],
  rowH: [0.5, 0.7, 0.6, 0.6, 0.6, 0.6],
  border: { type: "solid", color: C.line, pt: 1 },
  align: "center", valign: "middle", fontFace: BODY,
});
// 色碼圖例
const leg = [["已上線 / 佳", C.seafoam], ["需注意", C.amber], ["受阻 / 高風險", C.coral]];
leg.forEach((l, i) => {
  const x = M + i * 2.75;
  s.addShape(pptx.ShapeType.ellipse, { x, y: 5.55, w: 0.22, h: 0.22, fill: { color: l[1] }, line: { type: "none" } });
  s.addText(l[0], { x: x + 0.3, y: 5.5, w: 2.3, h: 0.32, valign: "middle", fontFace: BODY, fontSize: 10.5, color: C.mute, margin: 0 });
});
// 判讀
card(s, M, 6.0, CW, 1.05, C.panel);
s.addShape(pptx.ShapeType.roundRect, { x: M, y: 6.0, w: 0.1, h: 1.05, fill: { color: C.teal }, line: { type: "none" }, rectRadius: 0.03 });
s.addText([
  { text: "判讀　", options: { bold: true, color: C.teal } },
  { text: "3 天黑客松以 ", options: { color: C.ink } },
  { text: "A（現行強化）", options: { bold: true, color: C.navy } },
  { text: " 為主線出賽（已上線、風險最低）；", options: { color: C.ink } },
  { text: "D（EC2）", options: { bold: true, color: C.navy } },
  { text: " 為托管服務受阻時的保底；", options: { color: C.ink } },
  { text: "B / E", options: { bold: true, color: C.navy } },
  { text: " 作為資料驅動與全艦隊願景的演進方向寫進簡報。C 因帳號 AccessDenied 暫不採用。", options: { color: C.ink } },
], { x: M + 0.35, y: 6.0, w: CW - 0.65, h: 1.05, valign: "middle", fontFace: BODY, fontSize: 12, lineSpacingMultiple: 1.15, margin: 0 });
s.addNotes("比較表沿六個維度（運算 / 入口 / 閒置成本 / 維運 / 冷啟 / 黑客松適配）排列五案，highlight 現行方案 A。結論：A 為主線、D 為保底、B/E 為演進方向、C 受阻。");

/* ================= Slide 10 — 未來延伸路線圖 ================= */
s = pptx.addSlide(); lightBg(s); pageMark(s, 10);
head(s, "Roadmap", "從 15 艘 demo 到全艦隊即時營運平台");
const tlY = 2.2;
s.addShape(pptx.ShapeType.line, { x: M + 0.3, y: tlY, w: CW - 0.6, h: 0, line: { color: C.line, width: 3 } });
const phases = [
  { n: "現在", t: "Phase 0 · Demo", c: C.seafoam, pts: ["15 艘 · 5 年報表", "baked real-metrics.json", "ECS Fargate + ALB 已上線"] },
  { n: "近期", t: "Phase 1 · 資料驅動", c: C.teal, pts: ["系統介接 ingest API", "檔案上傳 CSV/xlsx", "後台設定門檻/通道/燃料對應"] },
  { n: "中期", t: "Phase 2 · 全艦隊 + BI", c: C.navy3, pts: ["Serverless / 事件驅動重算", "擴到 97 艘同架構", "QuickSight / Athena 自助 BI"] },
  { n: "願景", t: "Phase 3 · 即時 + ML", c: C.amber, pts: ["IoT Core 船端即時遙測", "SageMaker 油耗/衰退預測", "近即時 Speed Loss 偵測"] },
];
const pN = phases.length, pGap = 0.4, pW = (CW - pGap * (pN - 1)) / pN;
phases.forEach((p, i) => {
  const x = M + i * (pW + pGap), cx = x + pW / 2;
  s.addShape(pptx.ShapeType.ellipse, { x: cx - 0.16, y: tlY - 0.16, w: 0.32, h: 0.32, fill: { color: p.c }, line: { color: C.white, width: 2 } });
  chip(s, x + pW / 2 - 0.7, tlY - 0.78, 1.4, p.n, p.c, p.c === C.amber ? C.navy : C.white, 11);
  card(s, x, 2.6, pW, 3.45, C.panel);
  s.addShape(pptx.ShapeType.roundRect, { x, y: 2.6, w: pW, h: 0.55, fill: { color: p.c }, line: { type: "none" }, rectRadius: 0.09 });
  s.addShape(pptx.ShapeType.rect, { x, y: 2.85, w: pW, h: 0.3, fill: { color: p.c }, line: { type: "none" } });
  s.addText(p.t, { x: x + 0.1, y: 2.6, w: pW - 0.2, h: 0.55, align: "center", valign: "middle", fontFace: HEAD, fontSize: 13, bold: true, color: p.c === C.amber ? C.navy : C.white, margin: 0 });
  s.addText(p.pts.map((pt, j, a) => ({ text: pt, options: { bullet: { code: "2022", indent: 12 }, color: C.ink, breakLine: j < a.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.2, y: 3.35, w: pW - 0.4, h: 2.55, fontFace: BODY, fontSize: 11.5, lineSpacingMultiple: 1.1, margin: 0 });
});
s.addShape(pptx.ShapeType.roundRect, { x: M, y: 6.3, w: CW, h: 0.85, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.08 });
s.addText([
  { text: "落地三扇門　", options: { bold: true, color: C.amber } },
  { text: "① 系統介接（TMS 推 noon report → 觸發重算）　② 檔案上傳（CSV/xlsx dryRun 預覽再落庫）　③ 後台設定（門檻 / 告警通道 / 燃料對應表 / 資料來源模式）", options: { color: C.white } },
], { x: M + 0.3, y: 6.3, w: CW - 0.6, h: 0.85, valign: "middle", fontFace: BODY, fontSize: 12, lineSpacingMultiple: 1.15, margin: 0 });
s.addNotes("路線圖：Phase 0 現行 15 艘 demo；Phase 1 補資料驅動三扇門（系統介接 ingest API、檔案上傳 CSV/xlsx、後台設定門檻/通道/燃料對應）；Phase 2 擴到全艦隊 + Serverless + QuickSight/Athena BI；Phase 3 IoT Core 即時遙測 + SageMaker 預測，走向近即時偵測。");

/* ================= Slide 11 — 決策級聯 (NEW) ================= */
s = pptx.addSlide(); lightBg(s); pageMark(s, 11);
head(s, "Decision Cascade", "決策級聯：正常 → 注意 → 行動");
s.addText("同一套已上線服務，依 Speed Loss 對可調門檻的位置，把船分成三種決策狀態 — 數字觸發流程，最後一步永遠留給人。", { x: M, y: 1.6, w: CW, h: 0.55, fontFace: BODY, fontSize: 12.5, color: C.mute, italic: true, lineSpacingMultiple: 1.1, margin: 0 });
const casc = [
  { c: C.seafoam, tint: C.seafoamT, st: "正常", cond: "Speed Loss 低於門檻\n品質旗標通過", sys: ["看板綠燈、持續監測", "無需人工介入"], ex: "多數船", exSub: "常態監測中" },
  { c: C.amber, tint: C.amberT, st: "注意", cond: "接近 / 跨越門檻\n進 review 佇列", sys: ["Bedrock 產證據簡報", "看板黃燈、reviewPriority 排序"], ex: "S23 · 8.9%", exSub: "n=506 · HIGH · priority 2" },
  { c: C.coral, tint: C.coralT, st: "行動", cond: "持續跨越 + 高信心\n觸發告警扇出", sys: ["/alerts/notify → SNS 告警", "人安排水下檢查 / 清洗 / 打磨"], ex: "S11 · 21.8%", exSub: "539 有效日 · 691 天未清 · priority 1" },
];
const cN = casc.length, cGap = 0.5, cW = (CW - cGap * (cN - 1)) / cN;
casc.forEach((d, i) => {
  const x = M + i * (cW + cGap);
  card(s, x, 2.35, cW, 3.55, C.white);
  s.addShape(pptx.ShapeType.roundRect, { x, y: 2.35, w: cW, h: 0.72, fill: { color: d.c }, line: { type: "none" }, rectRadius: 0.09 });
  s.addShape(pptx.ShapeType.rect, { x, y: 2.72, w: cW, h: 0.35, fill: { color: d.c }, line: { type: "none" } });
  s.addText([{ text: "0" + (i + 1) + "　", options: { color: d.c === C.amber ? C.navy : C.white, bold: true } }, { text: d.st, options: { color: d.c === C.amber ? C.navy : C.white, bold: true } }], { x: x + 0.2, y: 2.35, w: cW - 0.4, h: 0.72, valign: "middle", fontFace: HEAD, fontSize: 19, margin: 0 });
  // 條件
  s.addText("條件", { x: x + 0.28, y: 3.22, w: cW - 0.56, h: 0.26, fontFace: BODY, fontSize: 9.5, bold: true, color: C.teal, charSpacing: 1, margin: 0 });
  s.addText(d.cond, { x: x + 0.28, y: 3.46, w: cW - 0.56, h: 0.62, fontFace: HEAD, fontSize: 12, bold: true, color: C.navy, lineSpacingMultiple: 1.05, margin: 0 });
  // 系統動作
  s.addText("系統動作", { x: x + 0.28, y: 4.16, w: cW - 0.56, h: 0.26, fontFace: BODY, fontSize: 9.5, bold: true, color: C.teal, charSpacing: 1, margin: 0 });
  s.addText(d.sys.map((p, j, a) => ({ text: p, options: { bullet: { code: "2022", indent: 10 }, color: C.ink, breakLine: j < a.length - 1, paraSpaceAfter: 4 } })), { x: x + 0.3, y: 4.4, w: cW - 0.58, h: 0.85, fontFace: BODY, fontSize: 10.5, lineSpacingMultiple: 1.0, margin: 0 });
  // 例 (資料 callout)
  s.addShape(pptx.ShapeType.roundRect, { x: x + 0.2, y: 5.3, w: cW - 0.4, h: 0.5, fill: { color: d.tint }, line: { type: "none" }, rectRadius: 0.06 });
  s.addText([{ text: "例　", options: { color: C.mute } }, { text: d.ex, options: { color: C.navy, bold: true } }], { x: x + 0.32, y: 5.3, w: cW - 0.6, h: 0.5, valign: "middle", fontFace: HEAD, fontSize: 13, margin: 0 });
  // 級聯箭頭
  if (i < cN - 1) s.addShape(pptx.ShapeType.line, { x: x + cW + 0.06, y: 4.1, w: cGap - 0.12, h: 0, line: { color: C.slate, width: 2, endArrowType: "triangle" } });
});
// 例子細節列 (小字)
casc.forEach((d, i) => {
  const x = M + i * (cW + cGap);
  s.addText(d.exSub, { x: x + 0.2, y: 5.82, w: cW - 0.4, h: 0.28, align: "center", fontFace: BODY, fontSize: 8.5, color: C.mute, margin: 0 });
});
// 底部收束帶
s.addShape(pptx.ShapeType.roundRect, { x: M, y: 6.5, w: CW, h: 0.65, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.08 });
s.addText([
  { text: "◆ 人在迴路　", options: { bold: true, color: C.amber } },
  { text: "門檻可調（/config/threshold）、扇出通道可換（SNS → SES / Slack）。系統只做「更快、可解釋、可行動」的證據，清不清、何時清由海事專家拍板。", options: { color: C.white } },
], { x: M + 0.28, y: 6.5, w: CW - 0.5, h: 0.65, valign: "middle", fontFace: BODY, fontSize: 11.5, lineSpacingMultiple: 1.0, margin: 0 });
s.addNotes("決策級聯把架構連到產品輸出：Speed Loss 相對可調門檻分三態 — 正常(綠,持續監測) / 注意(黃,進 review 佇列+Bedrock 證據簡報) / 行動(紅,SNS 告警+人安排清洗)。例子用真實資料：S23 8.9%(n=506,HIGH) 屬注意；S11 21.8%(539 有效日,691 天未清,priority 1) 屬行動。門檻與通道皆可調，最後一步留給人。");

/* ================= Slide 12 — Live Demo 導覽 (NEW) ================= */
s = pptx.addSlide(); darkBg(s); pageMark(s, 12, true);
// 背景 sonar 裝飾
ping(s, 11.9, 6.1, 1.5, C.navy3, C.navy3);
head(s, "Live Demo", "現場導覽：一個穩定 URL，三個入口", C.white);
s.addText("同一顆 Fargate 容器、同一個 ALB 靜態網域，task 重啟不換位址 — 三個頁面現場可直接打開。", { x: M, y: 1.6, w: 11, h: 0.5, fontFace: BODY, fontSize: 13, color: C.dim, lineSpacingMultiple: 1.1, margin: 0 });
const demos = [
  { code: "1", path: "/", title: "產品首頁", desc: "命題、方法（ISO 19030 · k=FOC/STW³）與價值主張概覽", cat: "net" },
  { code: "2", path: "/dashboard.html", title: "決策看板", desc: "15 艘 Speed Loss 排序、證據序列、AI 簡報與可調門檻", cat: "ai" },
  { code: "3", path: "/architecture.html", title: "架構互動圖", desc: "本簡報架構的網頁版：服務節點、資料流與方案對照", cat: "comp" },
];
const dN = demos.length, dGap = 0.45, dW = (CW - dGap * (dN - 1)) / dN;
demos.forEach((d, i) => {
  const x = M + i * (dW + dGap);
  s.addShape(pptx.ShapeType.roundRect, { x, y: 2.35, w: dW, h: 2.75, fill: { color: C.navy2 }, line: { color: C.navy3, width: 1 }, rectRadius: 0.11, shadow: { type: "outer", color: "05121F", opacity: 0.45, blur: 10, offset: 3, angle: 90 } });
  badge(s, x + 0.55, 2.9, d.code, d.cat, 0.5);
  s.addText(d.title, { x: x + 0.95, y: 2.55, w: dW - 1.1, h: 0.7, valign: "middle", fontFace: HEAD, fontSize: 17, bold: true, color: C.white, margin: 0 });
  s.addShape(pptx.ShapeType.roundRect, { x: x + 0.3, y: 3.35, w: dW - 0.6, h: 0.5, fill: { color: C.navy }, line: { type: "none" }, rectRadius: 0.06 });
  s.addText(d.path, { x: x + 0.3, y: 3.35, w: dW - 0.6, h: 0.5, align: "center", valign: "middle", fontFace: BODY, fontSize: 15, bold: true, color: C.amber, margin: 0 });
  s.addText(d.desc, { x: x + 0.3, y: 4.0, w: dW - 0.6, h: 0.95, fontFace: BODY, fontSize: 11.5, color: C.dim, lineSpacingMultiple: 1.15, margin: 0 });
});
// Base URL 帶
s.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.45, w: CW, h: 0.92, fill: { color: C.navy2 }, line: { color: C.seafoam, width: 1 }, rectRadius: 0.09 });
s.addText([
  { text: "Base　", options: { bold: true, color: C.seafoam } },
  { text: "http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com", options: { color: C.white } },
], { x: M + 0.35, y: 5.45, w: CW - 0.7, h: 0.92, valign: "middle", fontFace: BODY, fontSize: 15.5, margin: 0 });
s.addText("帳號 516665228894 · us-east-1 · ECS Fargate (ARM64) 常駐 · ALB 靜態 URL 不換位址", { x: M, y: 6.62, w: 12, h: 0.4, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0 });
s.addNotes("現場導覽：三個入口都掛在同一顆 Fargate 容器 / 同一個 ALB 靜態網域。/ 首頁講命題與方法、/dashboard.html 是 15 艘決策看板（Speed Loss 排序 + 證據 + AI 簡報 + 可調門檻）、/architecture.html 是架構互動版。task 重啟不換 IP，現場可安心直接打開。");

/* ================= Slide 13 — 結尾 ================= */
s = pptx.addSlide(); darkBg(s);
// 背景 sonar hero
ping(s, 11.6, 2.7, 1.6, C.navy3, C.navy3);
ping(s, 11.6, 2.7, 1.05, C.teal, C.navy3);
s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: H, fill: { color: C.amber }, line: { type: "none" } });
s.addText("一個命題，五種上雲路徑", { x: M, y: 1.5, w: 9, h: 0.5, fontFace: BODY, fontSize: 15, color: C.seafoam, bold: true, charSpacing: 2, margin: 0 });
s.addText("穩穩 demo，\n也留得住未來", { x: M, y: 2.0, w: 9, h: 1.7, fontFace: HEAD, fontSize: 40, color: C.white, bold: true, lineSpacingMultiple: 1.0, margin: 0 });
s.addText("以已上線的 Fargate + ALB 為基準線穩定出賽，用 EC2 保底、用 Serverless 與資料分析管線描繪從 15 艘到全艦隊的營運藍圖 — 讓數字站得住、決策留給人。", { x: M, y: 3.9, w: 10.6, h: 1.0, fontFace: BODY, fontSize: 15, color: C.dim, lineSpacingMultiple: 1.25, margin: 0 });
card(s, M, 5.15, CW, 0.95, C.navy2);
s.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.15, w: 0.1, h: 0.95, fill: { color: C.amber }, line: { type: "none" }, rectRadius: 0.03 });
s.addText([
  { text: "Live Demo　", options: { bold: true, color: C.amber } },
  { text: "http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com", options: { color: C.white } },
], { x: M + 0.35, y: 5.15, w: CW - 0.7, h: 0.95, valign: "middle", fontFace: BODY, fontSize: 15, margin: 0 });
s.addText("帳號 516665228894 · us-east-1 · ECS Fargate (ARM64) + ALB + ECR + Bedrock (Claude Haiku) + SNS", { x: M, y: 6.32, w: 11.5, h: 0.4, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0 });
s.addText("FleetMind　數字來自計算　語言來自 AI　決策留給人", { x: M, y: 6.85, w: 11.5, h: 0.4, fontFace: HEAD, fontSize: 14, italic: true, color: C.seafoam, margin: 0 });
s.addNotes("收尾：現行 Fargate + ALB 是穩定出賽基準線；EC2 保底、Serverless 與資料分析管線是未來營運藍圖。Live URL 可現場打開。一句話願景：讓數字站得住、決策留給人。");

/* ================= 輸出 ================= */
const out = path.join(__dirname, "fleetmind-aws-architecture.pptx");
pptx.writeFile({ fileName: out }).then(() => {
  console.log("OK →", out);
}).catch((e) => { console.error("FAIL", e); process.exit(1); });
