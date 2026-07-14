package com.fleetmind.api;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * Renders the branded HTML alert email for the SES channel. Pure/stateless so it
 * is trivially unit-testable. Every dynamic value is HTML-escaped to prevent
 * injection. Layout uses table + inline styles only (no external CSS/JS/images)
 * for Outlook/Gmail compatibility; palette mirrors the dashboard maritime theme.
 * Physical cost is expressed in fuel tonnes / percentages — never currency.
 */
final class AlertEmailTemplate {
    private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String DASHBOARD_URL =
            "http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com/";

    private AlertEmailTemplate() {
    }

    static String subject(List<DecisionDto> alerts) {
        long act = alerts.stream().filter(a -> "ACT".equals(a.status())).count();
        if (act > 0) {
            return "[FleetMind] " + act + " 艘船超過 Speed Loss 門檻 — 需安排養護";
        }
        return "[FleetMind] " + alerts.size() + " 艘船需關注 Speed Loss — 建議安排觀察";
    }

    static String render(double thresholdPct, List<DecisionDto> alerts) {
        String today = LocalDate.now(TAIPEI).format(DATE);
        String summary = alerts.size() + " 艘船需關注（門檻 "
                + String.format(Locale.US, "%.1f", thresholdPct) + "%）";

        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html><html lang=\"zh-Hant\"><head><meta charset=\"UTF-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
                .append("<title>FleetMind 船舶效能告警</title></head>")
                .append("<body style=\"margin:0;padding:0;background:#081820;\">")
                .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" ")
                .append("style=\"background:#081820;padding:24px 0;\"><tr><td align=\"center\">")
                .append("<table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" ")
                .append("style=\"width:600px;max-width:600px;background:#0E2A38;border-radius:14px;")
                .append("overflow:hidden;font-family:'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;\">");

        // Header band
        html.append("<tr><td style=\"padding:28px 32px 18px 32px;background:")
                .append("linear-gradient(135deg,#0B2430,#123141);border-bottom:1px solid #1C3B4A;\">")
                .append("<div style=\"color:#2FB09A;font-size:13px;letter-spacing:3px;")
                .append("text-transform:uppercase;font-weight:700;\">FleetMind</div>")
                .append("<div style=\"color:#E6F1F4;font-size:22px;font-weight:700;padding-top:6px;\">")
                .append("船舶效能告警</div>")
                .append("<div style=\"color:#8FA9B3;font-size:13px;padding-top:6px;\">")
                .append(esc(today)).append(" · ").append(esc(summary)).append("</div></td></tr>");

        // Cards
        html.append("<tr><td style=\"padding:20px 24px 8px 24px;\">");
        for (DecisionDto alert : alerts) {
            html.append(card(alert, thresholdPct));
        }
        html.append("</td></tr>");

        // CTA
        html.append("<tr><td align=\"center\" style=\"padding:8px 24px 28px 24px;\">")
                .append("<a href=\"").append(esc(DASHBOARD_URL)).append("\" ")
                .append("style=\"display:inline-block;background:#2FB09A;color:#062019;")
                .append("text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;")
                .append("border-radius:8px;\">開啟決策看板</a></td></tr>");

        // Footer
        html.append("<tr><td style=\"padding:18px 32px 26px 32px;background:#0A2029;")
                .append("border-top:1px solid #1C3B4A;\">")
                .append("<div style=\"color:#6E8A95;font-size:12px;line-height:1.6;\">")
                .append("數字來自計算，語言來自 AI，決策留給人。</div></td></tr>");

        html.append("</table></td></tr></table></body></html>");
        return html.toString();
    }

    private static String card(DecisionDto alert, double thresholdPct) {
        String color = statusColor(alert.status());
        StringBuilder card = new StringBuilder();
        card.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" ")
                .append("style=\"background:#12313F;border-radius:10px;margin:0 0 12px 0;\"><tr>")
                // Status light block
                .append("<td width=\"6\" style=\"background:").append(color)
                .append(";border-radius:10px 0 0 10px;\">&nbsp;</td>")
                .append("<td style=\"padding:16px 18px;\">")
                // Row 1: status pill + vesselId
                .append("<div style=\"font-size:0;\">")
                .append("<span style=\"display:inline-block;background:").append(color)
                .append(";color:#062019;font-size:11px;font-weight:700;padding:3px 9px;")
                .append("border-radius:20px;letter-spacing:1px;\">").append(esc(statusLabel(alert.status())))
                .append("</span>")
                .append("<span style=\"color:#E6F1F4;font-size:17px;font-weight:700;padding-left:10px;\">")
                .append(esc(alert.vesselId())).append("</span></div>")
                // Row 2: speed loss vs threshold
                .append("<div style=\"color:#B9D0D8;font-size:13px;padding-top:10px;\">")
                .append("Speed Loss <b style=\"color:").append(color).append(";\">")
                .append(esc(pct(alert.currentSpeedLossPct()))).append("</b>")
                .append(" <span style=\"color:#6E8A95;\">/ 門檻 ")
                .append(esc(pct(thresholdPct))).append("</span></div>")
                // Row 3: forecast
                .append("<div style=\"color:#8FA9B3;font-size:13px;padding-top:4px;\">")
                .append(esc(forecastText(alert, thresholdPct))).append("</div>")
                // Row 4: recommended action
                .append("<div style=\"color:#E6F1F4;font-size:13px;padding-top:8px;\">")
                .append("<span style=\"color:#2FB09A;\">建議動作</span> ")
                .append(esc(actionLabel(alert.recommendedAction()))).append("</div>");
        if (alert.rationale() != null && !alert.rationale().isBlank()) {
            card.append("<div style=\"color:#6E8A95;font-size:12px;padding-top:6px;line-height:1.6;\">")
                    .append(esc(alert.rationale())).append("</div>");
        }
        card.append("</td></tr></table>");
        return card.toString();
    }

    private static String statusColor(String status) {
        return "ACT".equals(status) ? "#E9694E"
                : "WATCH".equals(status) ? "#F4A72B" : "#2FB09A";
    }

    private static String statusLabel(String status) {
        return "ACT".equals(status) ? "立即處理"
                : "WATCH".equals(status) ? "觀察中" : "正常";
    }

    private static String actionLabel(String action) {
        if (action == null) {
            return "持續觀察";
        }
        return switch (action) {
            case "RECOMMEND_CLEANING" -> "規劃船體清洗";
            case "SCHEDULE_UWILD" -> "安排 UWILD 水下檢查";
            case "OBSERVE" -> "持續觀察";
            default -> action;
        };
    }

    private static String forecastText(DecisionDto alert, double thresholdPct) {
        if (alert.currentSpeedLossPct() >= thresholdPct) {
            return "目前已超過門檻";
        }
        Integer days = alert.forecastDaysToThreshold();
        if (days == null) {
            return "趨勢資料不足，暫無跨越門檻預估";
        }
        if (days <= 0) {
            return "已達或即將超過門檻";
        }
        return "預估 " + days + " 天後超過門檻";
    }

    private static String pct(double value) {
        return String.format(Locale.US, "%.1f%%", value);
    }

    private static String esc(String raw) {
        if (raw == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(raw.length() + 16);
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&#39;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }
}
