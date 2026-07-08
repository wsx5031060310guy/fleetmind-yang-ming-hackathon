#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Presentation, PresentationFile } = require("@oai/artifact-tool");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const slideSize = { width: 1280, height: 720 };
const frame = { left: 42, top: 40, width: 1196, height: 630 };

const C = {
  white: "#FFFFFF",
  ink: "#000000",
  body: "#222222",
  muted: "#555555",
  panel: "#EDEDED",
  panel2: "#F7F7F7",
  rule: "#B8BCC4",
  highlight: "#FF6B35",
  green: "#1E7D4F",
};

function cleanName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function addShape(slide, name, position, fill = C.panel, line = "none") {
  return slide.shapes.add({
    geometry: "rect",
    name,
    position,
    fill,
    line:
      line === "none"
        ? { style: "solid", fill: "none", width: 0 }
        : { style: "solid", fill: line, width: 1 },
  });
}

function addText(slide, name, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontSize: style.fontSize ?? 22,
    bold: style.bold ?? false,
    color: style.color ?? C.body,
    alignment: style.alignment ?? "left",
  };
  return shape;
}

function addRule(slide, name, left, top, width, color = C.rule, height = 1) {
  addShape(slide, name, { left, top, width, height }, color, "none");
}

function addHeader(slide, section, scoreLabel) {
  addText(slide, "section-label", section, { left: 42, top: 18, width: 360, height: 22 }, {
    fontSize: 12,
    bold: true,
    color: C.muted,
  });
  if (scoreLabel) {
    addShape(slide, "score-chip-bg", { left: 1040, top: 14, width: 198, height: 30 }, C.ink);
    addText(slide, "score-chip", scoreLabel, { left: 1052, top: 20, width: 174, height: 18 }, {
      fontSize: 12,
      bold: true,
      color: C.white,
      alignment: "center",
    });
  }
}

function addTitle(slide, title, subtitle, scoreLabel) {
  addHeader(slide, "FleetMind / Yang Ming AWS AI Hackathon", scoreLabel);
  addText(slide, "slide-title", title, { left: 42, top: 62, width: 920, height: 112 }, {
    fontSize: 48,
    bold: true,
    color: C.ink,
  });
  if (subtitle) {
    addText(slide, "slide-subtitle", subtitle, { left: 44, top: 176, width: 760, height: 62 }, {
      fontSize: 19,
      color: C.muted,
    });
  }
}

function addFooter(slide, slideNo, source = "docs/10 + docs/15") {
  addRule(slide, "footer-rule", 42, 670, 1196);
  addText(slide, "footer-source", source, { left: 42, top: 682, width: 880, height: 18 }, {
    fontSize: 10,
    color: C.muted,
  });
  addText(slide, "footer-page", String(slideNo).padStart(2, "0"), {
    left: 1192,
    top: 682,
    width: 46,
    height: 18,
  }, {
    fontSize: 10,
    color: C.muted,
    alignment: "right",
  });
}

function metric(slide, name, x, y, w, h, label, value, sub, color = C.ink) {
  addShape(slide, `${name}-bg`, { left: x, top: y, width: w, height: h }, C.panel2, C.rule);
  addText(slide, `${name}-label`, label, { left: x + 18, top: y + 18, width: w - 36, height: 22 }, {
    fontSize: 13,
    bold: true,
    color: C.muted,
  });
  addText(slide, `${name}-value`, value, { left: x + 18, top: y + 47, width: w - 36, height: 58 }, {
    fontSize: 40,
    bold: true,
    color,
  });
  addText(slide, `${name}-sub`, sub, { left: x + 18, top: y + 108, width: w - 36, height: 44 }, {
    fontSize: 15,
    color: C.body,
  });
}

function smallPanel(slide, name, x, y, w, h, title, body, accent = false) {
  addShape(slide, `${name}-bg`, { left: x, top: y, width: w, height: h }, accent ? C.ink : C.panel2, C.rule);
  addText(slide, `${name}-title`, title, { left: x + 18, top: y + 18, width: w - 36, height: 30 }, {
    fontSize: 19,
    bold: true,
    color: accent ? C.white : C.ink,
  });
  addText(slide, `${name}-body`, body, { left: x + 18, top: y + 60, width: w - 36, height: h - 78 }, {
    fontSize: 16,
    color: accent ? C.white : C.body,
  });
}

function bar(slide, name, x, y, w, h, label, value, max, color = C.ink) {
  addText(slide, `${name}-label`, label, { left: x, top: y - 2, width: 310, height: 24 }, {
    fontSize: 17,
    bold: true,
    color: C.ink,
  });
  addShape(slide, `${name}-track`, { left: x + 330, top: y + 4, width: w, height: h }, C.panel, "none");
  addShape(slide, `${name}-fill`, { left: x + 330, top: y + 4, width: Math.round((w * value) / max), height: h }, color, "none");
  addText(slide, `${name}-value`, `${value}%`, { left: x + 330 + w + 20, top: y - 1, width: 70, height: 24 }, {
    fontSize: 17,
    bold: true,
    color,
  });
}

function flowBox(slide, name, x, y, w, h, title, body, fill = C.panel2) {
  addShape(slide, `${name}-bg`, { left: x, top: y, width: w, height: h }, fill, C.rule);
  addText(slide, `${name}-title`, title, { left: x + 16, top: y + 14, width: w - 32, height: 24 }, {
    fontSize: 18,
    bold: true,
    color: C.ink,
  });
  addText(slide, `${name}-body`, body, { left: x + 16, top: y + 46, width: w - 32, height: h - 58 }, {
    fontSize: 13,
    color: C.body,
  });
}

function arrow(slide, name, x, y, w) {
  addRule(slide, `${name}-line`, x, y, w, C.ink, 2);
  addShape(slide, `${name}-head`, { left: x + w - 8, top: y - 5, width: 10, height: 10 }, C.ink, "none");
}

function tableLike(slide, name, x, y, colWidths, rowH, rows, headerRows = 1) {
  let top = y;
  rows.forEach((row, rowIndex) => {
    let left = x;
    const fill = rowIndex < headerRows ? C.ink : rowIndex % 2 === 0 ? C.panel2 : C.white;
    row.forEach((cell, colIndex) => {
      const width = colWidths[colIndex];
      addShape(slide, `${name}-${rowIndex}-${colIndex}-bg`, { left, top, width, height: rowH }, fill, C.rule);
      addText(slide, `${name}-${rowIndex}-${colIndex}-txt`, cell, {
        left: left + 10,
        top: top + 8,
        width: width - 20,
        height: rowH - 14,
      }, {
        fontSize: rowIndex < headerRows ? 13 : 12,
        bold: rowIndex < headerRows,
        color: rowIndex < headerRows ? C.white : C.body,
      });
      left += width;
    });
    top += rowH;
  });
}

function addNotes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

function newSlide(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = C.white;
  return slide;
}

function addMainSlides(presentation) {
  let n = 1;

  {
    const slide = newSlide(presentation);
    addHeader(slide, "Opening money number", "Business 20%");
    addText(slide, "hero-title", "這艘船每天多燒 3.0 噸油", { left: 42, top: 86, width: 780, height: 132 }, {
      fontSize: 62,
      bold: true,
      color: C.ink,
    });
    addText(slide, "hero-subtitle", "燃油加碳成本約 USD 2,370/day；年化約 USD 865k。若清潔成本 USD 40k，回本 16.87 天。", {
      left: 46,
      top: 230,
      width: 760,
      height: 68,
    }, {
      fontSize: 24,
      color: C.body,
    });
    smallPanel(slide, "positioning", 860, 86, 330, 214, "FleetMind 做很窄的事", "先用確定性計算找 Speed Loss、FUEL_CONSUMP、ROI；再讓 Bedrock 把證據講成營運語言。AI 不替人下維修命令。", true);
    metric(slide, "m1", 42, 360, 268, 160, "Extra fuel", "3.0 MT/day", "Observed 61.0 vs baseline 58.0 MT/day", C.highlight);
    metric(slide, "m2", 336, 360, 268, 160, "Avoidable cost", "USD 2,370", "Fuel USD 1,950 + EU ETS scenario USD 420", C.highlight);
    metric(slide, "m3", 630, 360, 268, 160, "Annualized", "USD 865k", "Decision framing, not model output", C.ink);
    metric(slide, "m4", 924, 360, 268, 160, "Payback", "16.87 days", "USD 40k cleaning scenario", C.green);
    addText(slide, "assumption", "Demo scenario assumptions: VLSFO USD 650/MT, EU ETS USD 90/tCO2, 50% ETS coverage, cleaning USD 40k.", {
      left: 42,
      top: 548,
      width: 940,
      height: 38,
    }, {
      fontSize: 13,
      color: C.muted,
    });
    addFooter(slide, n++, "docs/15 §1-2 scenario values; replace with Day2 18:00 frozen data");
    addNotes(slide, [
      "Open with the money number before naming features.",
      "Say this is a demo scenario until real data is frozen.",
      "Reinforce that FleetMind supports human review, not automatic maintenance orders.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "分數安排先對準 55% 硬盤", "陽明評分核心是 Speed Loss dashboard 與 FUEL_CONSUMP 正確性；商務價值緊接在 demo 後收分。", "Scoring map");
    bar(slide, "b1", 82, 270, 390, 24, "Speed Loss dashboard", 30, 30, C.highlight);
    bar(slide, "b2", 82, 328, 390, 24, "FUEL_CONSUMP objective correctness", 25, 30, C.ink);
    bar(slide, "b3", 82, 386, 390, 24, "Business decision value", 20, 30, C.green);
    bar(slide, "b4", 82, 444, 390, 24, "Technical feasibility", 15, 30, C.muted);
    bar(slide, "b5", 82, 502, 390, 24, "AI collaboration creativity", 10, 30, C.rule);
    smallPanel(slide, "scoring-claim", 874, 270, 300, 170, "一句定位", "數字來自計算，語言來自 AI，決策留給人。", true);
    smallPanel(slide, "scoring-proof", 874, 466, 300, 104, "上台節奏", "先證明 55% 可得分，再用 ROI、架構、防幻覺與限制聲明補足其餘分數。");
    addFooter(slide, n++, "README scoring + docs/10 slide plan");
    addNotes(slide, [
      "Use this slide to explain why the deck starts with a number instead of an agenda.",
      "The scoring table becomes the narrative structure.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "痛點不是缺圖表，而是缺可防守證據", "岸端人力有限，Power BI 加人工監控難以把每艘船的效率衰退轉成可執行維修排序。", "Theme 30%");
    smallPanel(slide, "pain1", 66, 276, 330, 220, "燃油成本直接放大", "船體阻力上升會反映在主機油耗。嚴重船體/螺槳劣化可造成超過 20% 效率損失。");
    smallPanel(slide, "pain2", 474, 276, 330, 220, "專家時間有限", "97 艘船靠人逐一追報表，會被噪音、資料缺口與不同速度條件淹沒。");
    smallPanel(slide, "pain3", 882, 276, 330, 220, "維修要有商務答案", "問題不是只問哪艘船變差，而是現在檢查、清潔或觀察哪個選項最划算。");
    addText(slide, "bridge", "FleetMind 把「正午報表 + 水下報告」變成三個營運輸出：排名、before-after、AI ops brief。", {
      left: 88,
      top: 548,
      width: 1080,
      height: 36,
    }, {
      fontSize: 23,
      bold: true,
      color: C.ink,
      alignment: "center",
    });
    addFooter(slide, n++, "docs/03 briefing notes + docs/09 §1");
    addNotes(slide, [
      "Keep this short: fuel cost, limited shore-side capacity, maintenance decision.",
      "Avoid generic AI chatbot language.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "資料邏輯先保住自動評分，再服務 Speed Loss", "Daily FOC 對每一列全量計算；天候與滿速條件只產生品質旗標，不刪列。", "FOC 25%");
    const y = 294;
    flowBox(slide, "d1", 54, y, 180, 138, "Raw data", "15 vessels\n2021-2025 noon reports\nunderwater events");
    arrow(slide, "a1", 246, y + 56, 84);
    flowBox(slide, "d2", 342, y, 210, 138, "All-row Daily FOC", "VLSFO normalization\nFOC = consump / hours * 24\nHOURS=0 guarded", C.panel);
    arrow(slide, "a2", 566, y + 56, 84);
    flowBox(slide, "d3", 662, y, 210, 138, "Quality flags", "WIND_SCALE > 4\nHOURS_FULL_SPEED < 22\nmissing optional fields");
    arrow(slide, "a3", 886, y + 56, 84);
    flowBox(slide, "d4", 982, y, 210, 138, "Speed Loss set", "Only qualified rows\nsame speed band\ntransform_version");
    smallPanel(slide, "iron", 126, 500, 428, 112, "鐵律", "提交檔不能因 filter 少列；品質面板要顯示被標記原因。", true);
    smallPanel(slide, "output", 618, 500, 428, 112, "輸出", "FUEL_CONSUMP export、Fleet ranking、Vessel before-after、AI brief context。");
    addFooter(slide, n++, "docs/09 §3 + docs/12 R9");
    addNotes(slide, [
      "This slide protects the 25% automatic score.",
      "Say filters never delete rows from FUEL_CONSUMP.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "Speed Loss 用同分母比較，避免把 slow steaming 算成污損", "FOC/V^n 作阻力 proxy；清潔事件切段，事件後參考窗建立 baseline，同速度帶比較。", "Speed Loss 30%");
    smallPanel(slide, "method1", 58, 248, 250, 160, "1. k 值 proxy", "k = Daily FOC / V^n\n預設 n=3；資料足夠時每船擬合 n。");
    smallPanel(slide, "method2", 346, 248, 250, 160, "2. 事件切段", "清潔/拋光/unknown breakpoint 將時間軸切成可比較段。");
    smallPanel(slide, "method3", 634, 248, 250, 160, "3. 同速度帶", "只和參考窗 ±1 kn 內的合格天比較，降低慢速營運偏差。");
    smallPanel(slide, "method4", 922, 248, 250, 160, "4. 三數字歸因", "總 Speed Loss、污損歸因、未解釋殘差一起呈現。");
    addShape(slide, "demo-strip-bg", { left: 72, top: 462, width: 1136, height: 86 }, C.ink);
    addText(slide, "demo-strip", "Live demo 三擊：排名表點最差船 → 事件標記線與 k 陡降 → AI brief citation 點回 dashboard", {
      left: 92,
      top: 488,
      width: 1096,
      height: 36,
    }, {
      fontSize: 24,
      bold: true,
      color: C.white,
      alignment: "center",
    });
    addFooter(slide, n++, "docs/09 §4 + docs/10 demo script");
    addNotes(slide, [
      "End this slide by moving into the live demo.",
      "Emphasize same-denominator before-after and unexplained residual.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "商務價值用回本天數，不用抽象效率口號", "同一組指標同時回答燃油成本、碳成本、CII 壓力與清潔 ROI。", "Business 20%");
    metric(slide, "bv1", 68, 270, 270, 160, "Fuel cost", "USD 1,950", "per day; 3.0 MT × USD 650/MT", C.highlight);
    metric(slide, "bv2", 374, 270, 270, 160, "CO2 impact", "9.342 t", "per day; 3.0 × 3.114 tCO2/MT", C.ink);
    metric(slide, "bv3", 680, 270, 270, 160, "EU ETS scenario", "USD 420", "per day; 50% × USD 90/tCO2", C.ink);
    metric(slide, "bv4", 986, 270, 210, 160, "Payback", "16.87", "days; USD 40k / USD 2,370", C.green);
    addShape(slide, "formula-bg", { left: 144, top: 496, width: 992, height: 74 }, C.panel2, C.rule);
    addText(slide, "formula", "Decision rule: 低信心先水下檢查；高信心且 payback < 45 天，排清潔/拋光 review；否則持續觀察。", {
      left: 172,
      top: 519,
      width: 936,
      height: 30,
    }, {
      fontSize: 23,
      bold: true,
      color: C.ink,
      alignment: "center",
    });
    addFooter(slide, n++, "docs/15 §1 scenario + docs/13 D1-D4");
    addNotes(slide, [
      "Present payback as decision support, not an automatic instruction.",
      "If judges challenge price assumptions, point to the assumption labels.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "技術刻意做少，讓 3 天內可以真的跑", "單服務同源減少 demo 風險；core-calc 是唯一數字來源；Bedrock 只解釋可引用指標。", "Tech 15% + AI 10%");
    flowBox(slide, "arch1", 58, 260, 150, 120, "S3", "raw/\nprocessed/\nexports/");
    arrow(slide, "arch-a1", 220, 320, 54);
    flowBox(slide, "arch2", 286, 260, 190, 120, "core-calc", "Java pure functions\ngolden checks\nno I/O");
    arrow(slide, "arch-a2", 488, 320, 54);
    flowBox(slide, "arch3", 554, 260, 170, 120, "DynamoDB", "metrics\nevents\nbrief cache");
    arrow(slide, "arch-a3", 736, 320, 54);
    flowBox(slide, "arch4", 802, 260, 190, 120, "Spring Boot", "API + static dashboard\nsame origin");
    arrow(slide, "arch-a4", 1004, 320, 54);
    flowBox(slide, "arch5", 1070, 260, 136, 120, "UI", "ranking\ntrends\nbrief");
    smallPanel(slide, "guardrails", 74, 438, 500, 126, "防幻覺三道線", "Prompt 只准引用 JSON 數字；後驗證抽取所有數字比對 citedMetrics；UI citation 可點回原始 metric。", true);
    smallPanel(slide, "subtractions", 650, 438, 500, 126, "刻意不用", "SageMaker：樣本太少且 25% 要公式。QuickSight：citation 深連結弱。CloudFront/RDS：3 天 demo 風險大。Bedrock Agents：炫技不換硬分。");
    addFooter(slide, n++, "docs/09 §2 + docs/12 §4 + apps/api guardrails");
    addNotes(slide, [
      "Use this slide to defend the simple architecture as a deliberate decision.",
      "Mention App Runner only if the event account already has access; otherwise ECS Express Mode or EC2 fallback.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addTitle(slide, "限制先講，Q&A 攻擊會變成可信度", "本方案參考 ISO 19030 精神，但清楚標出正午報表限制與緩解。", "Method defense");
    tableLike(slide, "iso", 72, 258, [250, 300, 466], 62, [
      ["ISO 19030 要求", "本方案", "影響與緩解"],
      ["對水速 STW", "多半是對地速 SOG", "洋流系統性偏差；同航線配對與長窗 median，殘差不歸因給污損。"],
      ["高頻自動感測", "每日人工正午報表", "噪音大；使用 median、信心等級、樣本數揭露。"],
      ["軸功率計", "主機油耗 proxy", "SFOC 隨負載變動；只做同速度帶比較。"],
      ["吃水/trim 修正", "有欄位才修正", "無欄位時信心降級，不把假精確放進主 KPI。"],
    ]);
    addFooter(slide, n++, "docs/09 §4.4 ISO deviation table");
    addNotes(slide, [
      "Do not apologize. Say this is the most honest version the provided noon reports can support.",
      "Bridge to Q&A backup slides if judges ask deeper method questions.",
    ]);
  }

  {
    const slide = newSlide(presentation);
    addHeader(slide, "Closing", "15 → 97 vessels");
    addText(slide, "close-title", "數字來自計算，語言來自 AI，決策留給人", {
      left: 74,
      top: 126,
      width: 1080,
      height: 150,
    }, {
      fontSize: 64,
      bold: true,
      color: C.ink,
      alignment: "center",
    });
    smallPanel(slide, "close1", 130, 342, 290, 142, "現在能做", "15 艘船排名、FUEL_CONSUMP export、before-after、AI ops brief。");
    smallPanel(slide, "close2", 496, 342, 290, 142, "比賽後擴展", "97 艘船同一管線；資料量增加不改架構。");
    smallPanel(slide, "close3", 862, 342, 290, 142, "決策邊界", "AI 不下令清潔；AI 把證據變成更快的人類審核。");
    addFooter(slide, n++, "README product framing + docs/10 closing");
    addNotes(slide, [
      "Close by returning to the exact opening promise.",
      "Do not end on architecture details.",
    ]);
  }

  return n;
}

const backups = [
  {
    title: "B1 為什麼不做 route optimization",
    answer: "題目重點是船體效率、Speed Loss、FUEL_CONSUMP 與水下清潔/拋光。航線最佳化範圍更大，3 天內難以驗證，也會稀釋 55% 硬分。",
    evidence: "docs/03 focus; docs/07 Q&A",
    limit: "若賽後取得天候預報與航線限制，可把 FleetMind 指標接到航線決策，但不是本次 MVP。",
  },
  {
    title: "B2 AI 是否做維修決策",
    answer: "否。系統只排序、舉證、產生 operations brief；維修與清潔決策保留給海事專家。",
    evidence: "AGENTS.md product framing; docs/09 §1",
    limit: "低信心時只建議 inspection，不直接建議 cleaning。",
  },
  {
    title: "B3 防幻覺三道線",
    answer: "數字只來自 core-calc 與 processed metrics。Bedrock prompt 不准推算新數字；後驗證比對 citedMetrics；UI citation 可回原始 metric。",
    evidence: "apps/api AiBriefPrompt + AiBriefGuardrail; docs/09 §5",
    limit: "語意仍需 human review，所以 brief 明確標示待人工審核。",
  },
  {
    title: "B4 品質差時怎麼辦",
    answer: "資料不丟列。FUEL_CONSUMP 全量輸出；Speed Loss 使用合格列；品質差會降信心並顯示原因碼統計。",
    evidence: "docs/09 §3.1; docs/12 R9",
    limit: "樣本太少時只做觀察或 inspection，不給高信心清潔建議。",
  },
  {
    title: "B5 Baseline 怎麼定",
    answer: "每船按水下清潔/拋光與 unknown breakpoint 切段；事件後首 10-15 個合格天作參考窗，最多 60 calendar days。",
    evidence: "docs/09 §4.1; docs/07 baseline answer",
    limit: "若事件表漏掉 dry-dock，以 k 值持續驟降偵測 unknown breakpoint。",
  },
  {
    title: "B6 Slow steaming 怎麼分離",
    answer: "不比較 raw FOC 或 raw speed。用 k = FOC/V^n 正規化，且只在參考窗 ±1 kn 同速度帶比較。",
    evidence: "docs/09 §4.1; docs/07 slow steaming answer",
    limit: "若速度偏離過大，信心等級降低，而不是硬歸因給污損。",
  },
  {
    title: "B7 USD 40k 清潔要不要花",
    answer: "先看信心與樣本數。高信心且 payback 低於門檻才排 cleaning review；低信心先做水下 inspection。",
    evidence: "docs/15 scenario; docs/07 ROI answer",
    limit: "清潔成本、油價、碳價都是 assumption，Day1/Day2 要換成陽明或供應商真值。",
  },
  {
    title: "B8 SOG 與黑潮洋流怎麼辦",
    answer: "正午報表多半是 SOG，不是 ISO 要求的 STW。固定航線的洋流是系統性偏差；用同航線配對與長窗 median 緩解。",
    evidence: "docs/09 §4.4; docs/07 SOG answer",
    limit: "無 log speed / slip 欄位時，殘差明確顯示為 unexplained。",
  },
  {
    title: "B9 Fouling attribution 68% 從哪裡來",
    answer: "段內 k_t 對時間做 Theil-Sen robust regression；趨勢成分歸因為生物污損累積，殘差列為未歸因。",
    evidence: "docs/09 §4.2; docs/07 attribution answer",
    limit: "不宣稱所有殘差都已控制；SST、湧浪、洋流與填報噪音都可能存在。",
  },
  {
    title: "B10 為什麼不用 SageMaker",
    answer: "ISO 19030 精神是確定性方法；篩後每船樣本少；FUEL_CONSUMP 25% 要官方公式，不需要黑箱模型。",
    evidence: "docs/07 SageMaker answer; docs/11 route study",
    limit: "若 Day2 18:00 硬盤全綠，才可把 RCF anomaly 當 P2 加分支線，不進主 KPI。",
  },
  {
    title: "B11 V^3 是否過度簡化",
    answer: "立方律是近似。服務速度區間 n 常在 3.5-4.5；所以我們限制同速度帶，資料足夠時 per-vessel fit n。",
    evidence: "docs/09 §4.1; docs/07 cube-law answer",
    limit: "若樣本不足以擬合 n，KPI 顯示 estimate 與信心等級。",
  },
  {
    title: "B12 AWS 月成本",
    answer: "15 艘船用單服務、S3、DynamoDB on-demand、Bedrock per brief；估計低於 USD 70/month，97 艘同架構。",
    evidence: "docs/07 AWS cost answer; docs/09 P1 architecture",
    limit: "App Runner 新客戶限制已更新；event account 若無 access，改 ECS Express Mode 或 EC2 docker。",
  },
  {
    title: "B13 CII A-E 與 corrective action",
    answer: "CII 適用 5,000 GT 以上船舶，A-E rating；D 連續三年或 E 需 corrective action plan。FleetMind 把多燒油轉成 CII 壓力方向。",
    evidence: "docs/15 IMO sources",
    limit: "Deck 只做方向與 scenario，不替代正式 CII 計算。",
  },
  {
    title: "B14 為何提交檔全量計算",
    answer: "自動評分可能要求所有官方列。先篩選再算會少列；FleetMind 只把 filter 變 quality flags。",
    evidence: "docs/09 §3.1; docs/12 R9",
    limit: "官方若要求 filtered 版本，pipeline 也會預產 filtered export，但全量版永遠保留。",
  },
  {
    title: "B15 Repo 安全與資料刪除",
    answer: "GitHub 不放原始企業資料與憑證。raw/processed/exports 留在 event AWS；賽後依規則清 S3、DynamoDB、本機 snapshot。",
    evidence: "docs/16 runbook; scripts/cleanup-event-data.sh",
    limit: "Day1 需向主辦方確認資料可否保留、刪除時點與截圖/錄影限制。",
  },
];

function addBackupSlides(presentation, startNo) {
  let n = startNo;
  for (const item of backups) {
    const slide = newSlide(presentation);
    addHeader(slide, "Backup Q&A", "Appendix");
    addText(slide, `${cleanName(item.title)}-title`, item.title, {
      left: 64,
      top: 82,
      width: 1040,
      height: 64,
    }, {
      fontSize: 38,
      bold: true,
      color: C.ink,
    });
    smallPanel(slide, "answer", 78, 208, 536, 190, "短答", item.answer, true);
    smallPanel(slide, "evidence", 666, 208, 450, 112, "證據", item.evidence);
    smallPanel(slide, "limit", 666, 354, 450, 126, "限制", item.limit);
    addShape(slide, "backup-mark", { left: 86, top: 510, width: 1030, height: 42 }, C.panel2, C.rule);
    addText(slide, "backup-return", "回答格式：一句結論 + 一個證據 + 一個限制，最後回到「數字確定性、AI 可追溯、決策留給人」。", {
      left: 106,
      top: 522,
      width: 990,
      height: 20,
    }, {
      fontSize: 17,
      color: C.ink,
      alignment: "center",
    });
    addFooter(slide, n++, "docs/07 judge Q&A + docs/15 backup list");
    addNotes(slide, [
      "Use only if asked.",
      "Keep answer under 40 seconds.",
    ]);
  }
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function main() {
  const presentation = Presentation.create({ slideSize });
  const nextSlideNo = addMainSlides(presentation);
  addBackupSlides(presentation, nextSlideNo);

  const distDir = path.join(__dirname, "dist");
  await fs.mkdir(distDir, { recursive: true });

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(distDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(path.join(distDir, `${stem}.layout.json`), await (await slide.export({ format: "layout" })).text());
  }

  await writeBlob(
    path.join(__dirname, "fleetmind-proposal-deck-preview.webp"),
    await presentation.export({ format: "webp", montage: true, scale: 1 }),
  );

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(path.join(__dirname, "fleetmind-proposal-deck.pptx"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
