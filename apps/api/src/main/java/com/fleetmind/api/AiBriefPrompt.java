package com.fleetmind.api;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AiBriefPrompt {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String SYSTEM_PROMPT = """
            你是 FleetMind 船舶效能決策支援分析員。只能使用提供的 JSON，不得加入外部事實、猜測或隱藏假設。
            請以繁體中文輸出且固定使用四個段落標題：異常摘要 / 水下事件關聯分析 / 建議行動 / 限制與缺失資料。
            每個數字都必須逐一緊接 inline [metric_id]，metric_id 只能取自 citedMetrics，數字必須完全符合該 metric 的 value。
            不得創造任何新數字。資料不足時明說缺少什麼，不得推測。
            lowConfidence 為 true 時，建議行動只能建議 inspection/observation，不得直接建議 cleaning。
            不得宣稱保證節省、保證因果或直接下達維護命令。數字來自計算，語言來自 AI，決策留給人。
            """;

    private AiBriefPrompt() {
    }

    public static String systemPrompt() {
        return SYSTEM_PROMPT;
    }

    public static String buildUserPrompt(
            String vesselId,
            BeforeAfterDto beforeAfter,
            List<UnderwaterEventDto> events,
            List<CitedMetricDto> citedMetrics,
            boolean lowConfidence) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("vesselId", vesselId);
        payload.put("lowConfidence", lowConfidence);
        payload.put("beforeAfter", beforeAfter);
        payload.put("underwaterEvents", events);
        payload.put("citedMetrics", citedMetrics);
        try {
            return "請只依下列 JSON 產生精簡維護決策簡報：\n"
                    + OBJECT_MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Unable to serialize AI brief prompt", exception);
        }
    }

    public static String buildUserPrompt(
            String vesselId,
            BeforeAfterDto beforeAfter,
            List<UnderwaterEventDto> events,
            List<CitedMetricDto> citedMetrics) {
        return buildUserPrompt(vesselId, beforeAfter, events, citedMetrics, false);
    }
}
