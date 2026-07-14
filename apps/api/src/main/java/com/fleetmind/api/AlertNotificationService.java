package com.fleetmind.api;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.Body;
import software.amazon.awssdk.services.sesv2.model.Content;
import software.amazon.awssdk.services.sesv2.model.Destination;
import software.amazon.awssdk.services.sesv2.model.EmailContent;
import software.amazon.awssdk.services.sesv2.model.Message;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Fans threshold alerts out to three optional channels — SNS (plain text via the
 * fleetmind-alerts topic), SES (branded HTML email) and a generic outbound webhook
 * (standardised JSON + HMAC-SHA256 signature). Every channel is env-configured,
 * fires on a shared daemon executor, is bounded by a short timeout and, on failure,
 * only warns — a notification problem must never break the decision dashboard API.
 * Secrets (webhook secret, SES identities) come from env vars, never hard-coded.
 */
@Service
public final class AlertNotificationService {
    private static final Logger LOGGER = LoggerFactory.getLogger(AlertNotificationService.class);
    private static final String FALLBACK_REGION = "us-east-1";
    private static final Set<String> ALL_CHANNELS = Set.of("email", "sns", "ses", "webhook");

    private final String topicArn;
    private final String region;
    private final String webhookUrl;
    private final String webhookSecret;
    private final String sesSender;
    private final List<String> sesRecipients;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "fleetmind-alert-dispatch");
        thread.setDaemon(true);
        return thread;
    });
    private volatile SnsClient snsClient;
    private volatile SesV2Client sesClient;
    private volatile HttpClient httpClient;

    /** Convenience constructor (SNS only) kept for tests and simple wiring. */
    public AlertNotificationService(String topicArn, String region) {
        this(topicArn, region, "", "", "", "");
    }

    @Autowired
    public AlertNotificationService(
            @Value("${FLEETMIND_ALERT_TOPIC_ARN:}") String topicArn,
            @Value("${AWS_REGION:}") String region,
            @Value("${FLEETMIND_WEBHOOK_URL:}") String webhookUrl,
            @Value("${FLEETMIND_WEBHOOK_SECRET:}") String webhookSecret,
            @Value("${FLEETMIND_SES_SENDER:}") String sesSender,
            @Value("${FLEETMIND_SES_RECIPIENTS:}") String sesRecipients) {
        this.topicArn = trim(topicArn);
        this.region = trim(region);
        this.webhookUrl = trim(webhookUrl);
        this.webhookSecret = trim(webhookSecret);
        this.sesSender = trim(sesSender);
        this.sesRecipients = parseCsvEnv(sesRecipients);
    }

    /** SNS topic (also backs the "email" subscription channel). */
    public boolean configured() {
        return !topicArn.isBlank();
    }

    public boolean webhookConfigured() {
        return !webhookUrl.isBlank();
    }

    /** SES needs a verified sender plus at least one recipient (env or admin fallback). */
    public boolean sesConfigured(List<String> fallbackRecipients) {
        return !sesSender.isBlank() && !effectiveRecipients(fallbackRecipients).isEmpty();
    }

    /** Convenience overload: enable every channel, no fallback recipients. */
    public void publishAsync(double thresholdPct, List<DecisionDto> alerts) {
        publishAsync(thresholdPct, alerts, ALL_CHANNELS, List.of());
    }

    public void publishAsync(double thresholdPct, List<DecisionDto> alerts,
            Set<String> enabledChannels, List<String> fallbackEmailRecipients) {
        List<DecisionDto> snapshot = List.copyOf(alerts);
        Set<String> channels = enabledChannels == null ? Set.of() : enabledChannels;

        boolean sns = configured() && (channels.contains("sns") || channels.contains("email"));
        if (sns) {
            executor.submit(() -> publishSns(thresholdPct, snapshot));
        }
        if (channels.contains("ses") && sesConfigured(fallbackEmailRecipients)) {
            List<String> recipients = effectiveRecipients(fallbackEmailRecipients);
            executor.submit(() -> publishSes(thresholdPct, snapshot, recipients));
        }
        if (channels.contains("webhook") && webhookConfigured()) {
            executor.submit(() -> publishWebhook(thresholdPct, snapshot));
        }
    }

    // --- SNS (plain text) ---

    private void publishSns(double thresholdPct, List<DecisionDto> alerts) {
        try {
            snsClient().publish(PublishRequest.builder()
                    .topicArn(topicArn)
                    .subject("FleetMind vessel alerts")
                    .message(snsMessage(thresholdPct, alerts))
                    .build());
        } catch (Exception exception) {
            LOGGER.warn("SNS alert publish failed: {}: {}",
                    exception.getClass().getSimpleName(), exception.getMessage());
        }
    }

    private String snsMessage(double thresholdPct, List<DecisionDto> alerts) {
        StringBuilder text = new StringBuilder("FleetMind threshold=")
                .append(thresholdPct).append("%, alerts=").append(alerts.size());
        for (DecisionDto alert : alerts) {
            text.append('\n').append(alert.status()).append(' ')
                    .append(alert.vesselId()).append(" speedLoss=")
                    .append(String.format(java.util.Locale.US, "%.2f%%", alert.currentSpeedLossPct()))
                    .append(" action=").append(alert.recommendedAction());
        }
        return text.toString();
    }

    // --- SES (branded HTML email) ---

    private void publishSes(double thresholdPct, List<DecisionDto> alerts, List<String> recipients) {
        try {
            String html = AlertEmailTemplate.render(thresholdPct, alerts);
            String subject = AlertEmailTemplate.subject(alerts);
            sesClient().sendEmail(SendEmailRequest.builder()
                    .fromEmailAddress(sesSender)
                    .destination(Destination.builder().toAddresses(recipients).build())
                    .content(EmailContent.builder()
                            .simple(Message.builder()
                                    .subject(Content.builder().data(subject).charset("UTF-8").build())
                                    .body(Body.builder()
                                            .html(Content.builder().data(html).charset("UTF-8").build())
                                            .build())
                                    .build())
                            .build())
                    .build());
        } catch (Exception exception) {
            LOGGER.warn("SES alert email failed: {}: {}",
                    exception.getClass().getSimpleName(), exception.getMessage());
        }
    }

    // --- Generic outbound webhook (JSON + HMAC-SHA256) ---

    private void publishWebhook(double thresholdPct, List<DecisionDto> alerts) {
        try {
            String body = webhookBody(thresholdPct, alerts);
            HttpRequest.Builder request = HttpRequest.newBuilder()
                    .uri(URI.create(webhookUrl))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "FleetMind-AlertHook/1")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            if (!webhookSecret.isBlank()) {
                request.header("X-FleetMind-Signature", hmacSha256(body, webhookSecret));
            }
            HttpResponse<Void> response = httpClient()
                    .send(request.build(), HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 != 2) {
                LOGGER.warn("Webhook alert returned HTTP {}", response.statusCode());
            }
        } catch (Exception exception) {
            LOGGER.warn("Webhook alert post failed: {}: {}",
                    exception.getClass().getSimpleName(), exception.getMessage());
        }
    }

    private String webhookBody(double thresholdPct, List<DecisionDto> alerts) {
        StringBuilder json = new StringBuilder("{");
        json.append("\"thresholdPct\":").append(thresholdPct);
        json.append(",\"generatedAt\":");
        appendJsonString(json, Instant.now().toString());
        json.append(",\"alertCount\":").append(alerts.size());
        json.append(",\"alerts\":[");
        for (int i = 0; i < alerts.size(); i++) {
            DecisionDto alert = alerts.get(i);
            if (i > 0) {
                json.append(',');
            }
            json.append("{\"vesselId\":");
            appendJsonString(json, alert.vesselId());
            json.append(",\"status\":");
            appendJsonString(json, alert.status());
            json.append(",\"currentSpeedLossPct\":").append(alert.currentSpeedLossPct());
            json.append(",\"recommendedAction\":");
            appendJsonString(json, String.valueOf(alert.recommendedAction()));
            json.append(",\"forecastDaysToThreshold\":")
                    .append(alert.forecastDaysToThreshold() == null
                            ? "null" : alert.forecastDaysToThreshold().toString());
            json.append('}');
        }
        return json.append("]}").toString();
    }

    private static String hmacSha256(String body, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    private static void appendJsonString(StringBuilder out, String raw) {
        out.append('"');
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        out.append('"');
    }

    // --- lazy clients ---

    private SnsClient snsClient() {
        SnsClient current = snsClient;
        if (current == null) {
            synchronized (this) {
                current = snsClient;
                if (current == null) {
                    snsClient = current = SnsClient.builder()
                            .region(Region.of(region.isBlank() ? regionFromArn(topicArn) : region))
                            .overrideConfiguration(shortTimeouts())
                            .build();
                }
            }
        }
        return current;
    }

    private SesV2Client sesClient() {
        SesV2Client current = sesClient;
        if (current == null) {
            synchronized (this) {
                current = sesClient;
                if (current == null) {
                    sesClient = current = SesV2Client.builder()
                            .region(Region.of(effectiveRegion()))
                            .overrideConfiguration(shortTimeouts())
                            .build();
                }
            }
        }
        return current;
    }

    private HttpClient httpClient() {
        HttpClient current = httpClient;
        if (current == null) {
            synchronized (this) {
                current = httpClient;
                if (current == null) {
                    httpClient = current = HttpClient.newBuilder()
                            .connectTimeout(Duration.ofSeconds(3))
                            .build();
                }
            }
        }
        return current;
    }

    private static ClientOverrideConfiguration shortTimeouts() {
        return ClientOverrideConfiguration.builder()
                .apiCallAttemptTimeout(Duration.ofSeconds(3))
                .apiCallTimeout(Duration.ofSeconds(5))
                .retryPolicy(RetryPolicy.builder().numRetries(1).build())
                .build();
    }

    private String effectiveRegion() {
        if (!region.isBlank()) {
            return region;
        }
        String[] parts = topicArn.split(":", -1);
        if (parts.length > 3 && !parts[3].isBlank()) {
            return parts[3];
        }
        return FALLBACK_REGION;
    }

    private static String regionFromArn(String arn) {
        String[] parts = arn.split(":", -1);
        if (parts.length > 3 && !parts[3].isBlank()) {
            return parts[3];
        }
        throw new IllegalArgumentException("SNS topic ARN has no region and AWS_REGION is unset");
    }

    private List<String> effectiveRecipients(List<String> fallbackRecipients) {
        if (!sesRecipients.isEmpty()) {
            return sesRecipients;
        }
        return parseList(fallbackRecipients);
    }

    private static List<String> parseCsvEnv(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String part : value.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return List.copyOf(out);
    }

    private static List<String> parseList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                out.add(value.trim());
            }
        }
        return List.copyOf(out);
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    @PreDestroy
    void close() {
        executor.shutdown();
        if (snsClient != null) {
            snsClient.close();
        }
        if (sesClient != null) {
            sesClient.close();
        }
    }
}
