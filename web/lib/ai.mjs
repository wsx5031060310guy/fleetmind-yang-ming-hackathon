import { beforeAfter, performance, underwaterEvents } from "./demo-data.mjs";
import { summaries } from "./decision.mjs";

export const SYSTEM_PROMPT = `你是 FleetMind 船舶效能決策支援分析員。只能使用提供的 JSON，不得加入外部事實、猜測或隱藏假設。
請以繁體中文輸出且固定使用四個段落標題：異常摘要 / 水下事件關聯分析 / 建議行動 / 限制與缺失資料。
每個數字都必須逐一緊接 inline [metric_id]，metric_id 只能取自 citedMetrics，數字必須完全符合該 metric 的 value。
不得創造任何新數字。除了緊接 [metric_id] 的 cited 數值外，輸出中不得出現任何其他數字（包含年份、日期、事件次數、天數、百分比、金額）。
提到水下養護事件時，一律以事件類型與相對順序描述（例如「最近一次水下檢查」「前一次船殼清潔」），不要寫出任何年份或日期。
不要使用數字編號清單（例如「1.」「2.」「3.」）；需要條列時一律用「・」項目符號或純文字敘述。
資料不足時明說缺少什麼，不得推測。
lowConfidence 為 true 時，建議行動只能建議 inspection/observation，不得直接建議 cleaning。
不得宣稱保證節省、保證因果或直接下達維護命令。數字來自計算，語言來自 AI，決策留給人。
`;

function q(value) {
  return JSON.stringify(value);
}

function citedMetrics(vesselId, threshold) {
  const data = beforeAfter(vesselId, underwaterEvents(vesselId)[0].eventId);
  const href = `/api/vessels/${vesselId}/before-after?eventId=${data.eventId}`;
  const latest = performance(vesselId).at(-1).speedLossPct;
  const summary = summaries(threshold).find((candidate) => candidate.vesselId === vesselId);
  if (!summary) throw new Error(`unknown vessel: ${vesselId}`);
  return [
    { metricId: "latest_speed_loss_pct", value: latest.toFixed(2), href: "/api/fleet/summary" },
    { metricId: "fuel_penalty_pct", value: summary.fuelPenaltyPct.toFixed(2), href: "/api/fleet/summary" },
    { metricId: "median_k_before", value: data.medianKBefore.toFixed(5), href },
    { metricId: "median_k_after", value: data.medianKAfter.toFixed(5), href },
    { metricId: "recovery_pct", value: data.recoveryPct.toFixed(2), href }
  ];
}

function jacksonPrettyPayload(vesselId, lowConfidence, data, events, citations) {
  const lines = [
    "{",
    `  \"vesselId\" : ${q(vesselId)},`,
    `  \"lowConfidence\" : ${lowConfidence},`,
    "  \"beforeAfter\" : {",
    `    \"recoveryPct\" : ${data.recoveryPct},`,
    `    \"eventId\" : ${q(data.eventId)},`,
    `    \"medianKBefore\" : ${data.medianKBefore},`,
    `    \"medianKAfter\" : ${data.medianKAfter},`,
    `    \"vesselId\" : ${q(data.vesselId)}`,
    "  },",
    "  \"underwaterEvents\" : [ {"
  ];
  events.forEach((event, index) => {
    if (index > 0) lines.push("  }, {");
    lines.push(
      `    \"eventId\" : ${q(event.eventId)},`,
      `    \"vesselId\" : ${q(event.vesselId)},`,
      `    \"date\" : ${q(event.date)},`,
      `    \"type\" : ${q(event.type)}`
    );
  });
  lines.push("  } ],", "  \"citedMetrics\" : [ {");
  citations.forEach((citation, index) => {
    if (index > 0) lines.push("  }, {");
    lines.push(
      `    \"metricId\" : ${q(citation.metricId)},`,
      `    \"value\" : ${q(citation.value)},`,
      `    \"href\" : ${q(citation.href)}`
    );
  });
  lines.push("  } ]", "}");
  return lines.join("\n");
}

function normalizeNumber(value) {
  const numeric = value.replaceAll("$", "").replaceAll(",", "").trim();
  const number = Number(numeric);
  return Object.is(number, -0) ? "0" : String(number);
}

export function validateBrief(briefText, citations) {
  const safeCitations = citations ?? [];
  const allowedMetricIds = safeCitations.map((metric) => metric.metricId);
  const numbersByMetric = new Map(safeCitations.map((metric) => [
    metric.metricId,
    new Set([...metric.value.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?/g)]
      .map((match) => normalizeNumber(match[0])))
  ]));
  const violations = [];
  if (allowedMetricIds.length === 0) violations.push("missing cited metrics");

  const text = briefText ?? "";
  const claimPattern = /(?<![A-Za-z0-9_-])(?:(?:USD|\$)\s*)?(-?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:%|days?|天|USD|\$|MT|metric tons?|tons?|tCO2e?|tCO2|CO2|knots?|kn|節|hours?|小時))?(?![A-Za-z0-9_-])/gi;
  for (const claim of text.matchAll(claimPattern)) {
    const start = claim.index;
    const end = start + claim[0].length;
    if (insideMatch(text, start, /\[([A-Za-z0-9_-]+)]/g)
        || insideMatch(text, start, /\d{4}-\d{2}-\d{2}/g)) continue;
    const citation = nearestCitation(text, start, end);
    if (citation === null) {
      violations.push(`uncited numeric claim: ${claim[0]}`);
    } else if (!numbersByMetric.get(citation)?.has(normalizeNumber(claim[1]))) {
      violations.push(`claim cites wrong metric: ${claim[0]} [${citation}]`);
    }
  }
  return { passed: violations.length === 0, violations, allowedMetricIds };
}

function insideMatch(text, position, pattern) {
  for (const match of text.matchAll(pattern)) {
    if (match.index <= position && position < match.index + match[0].length) return true;
    if (match.index > position) return false;
  }
  return false;
}

function sentenceStart(text, position) {
  for (let index = position - 1; index >= 0; index--) {
    if (text[index] === "。" || isSentencePeriod(text, index)) return index + 1;
  }
  return 0;
}

function sentenceEnd(text, position) {
  for (let index = position; index < text.length; index++) {
    if (text[index] === "。" || isSentencePeriod(text, index)) return index;
  }
  return text.length;
}

function isSentencePeriod(text, index) {
  if (text[index] !== ".") return false;
  return index === 0 || index + 1 === text.length
    || !/\d/.test(text[index - 1]) || !/\d/.test(text[index + 1]);
}

function nearestCitation(text, claimStart, claimEnd) {
  const start = sentenceStart(text, claimStart);
  const end = sentenceEnd(text, claimEnd);
  let before = null;
  let beforeDistance = Number.MAX_SAFE_INTEGER;
  let after = null;
  let afterDistance = Number.MAX_SAFE_INTEGER;
  for (const match of text.matchAll(/\[([A-Za-z0-9_-]+)]/g)) {
    const matchEnd = match.index + match[0].length;
    if (match.index < start || matchEnd > end) continue;
    if (match.index >= claimEnd) {
      const distance = match.index - claimEnd;
      if (distance <= 120 && distance < afterDistance) {
        after = match[1];
        afterDistance = distance;
      }
    } else if (matchEnd <= claimStart) {
      const distance = claimStart - matchEnd;
      if (distance <= 120 && distance < beforeDistance) {
        before = match[1];
        beforeDistance = distance;
      }
    }
  }
  return after ?? before;
}

function fallbackText(vesselId, citations, forced) {
  const values = Object.fromEntries(citations.map((metric) => [metric.metricId, metric.value]));
  return `${vesselId} shows speed loss under comparable conditions. `
    + `The deterministic calculation estimates ${values.latest_speed_loss_pct}`
    + `% speed loss [latest_speed_loss_pct] and ${values.fuel_penalty_pct}`
    + "% same-speed fuel penalty [fuel_penalty_pct]. Recommend UWILD first; "
    + (forced
      ? "clean only when inspection evidence supports it."
      : "clean only when inspection evidence and hull attribution support it.");
}

export function aiBrief(vesselId, threshold, forceFallback) {
  const citations = citedMetrics(vesselId, threshold);
  const briefText = fallbackText(vesselId, citations, forceFallback);
  return {
    vesselId,
    generatedAt: new Date().toISOString(),
    mode: forceFallback ? "deterministic-forced-fallback" : "deterministic-fallback",
    briefText,
    citedMetrics: citations,
    guardrail: validateBrief(briefText, citations)
  };
}

export function aiBriefPrompt(vesselId, threshold) {
  const citations = citedMetrics(vesselId, threshold);
  const events = underwaterEvents(vesselId);
  const data = beforeAfter(vesselId, events[0].eventId);
  const lowConfidence = summaries(threshold)
    .find((candidate) => candidate.vesselId === vesselId)?.confidence === "LOW";
  const sampleText = fallbackText(vesselId, citations, true);
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: "請只依下列 JSON 產生精簡維護決策簡報：\n"
      + jacksonPrettyPayload(vesselId, lowConfidence, data, events, citations),
    citedMetrics: citations,
    sampleValidation: validateBrief(sampleText, citations)
  };
}
