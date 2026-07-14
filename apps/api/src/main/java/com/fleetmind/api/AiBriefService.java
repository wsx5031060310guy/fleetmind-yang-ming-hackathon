package com.fleetmind.api;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.http.SdkHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.ContentBlock;
import software.amazon.awssdk.services.bedrockruntime.model.ConversationRole;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseRequest;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseResponse;
import software.amazon.awssdk.services.bedrockruntime.model.InferenceConfiguration;
import software.amazon.awssdk.services.bedrockruntime.model.Message;

import java.lang.reflect.Method;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AiBriefService {
    private static final Logger LOGGER = LoggerFactory.getLogger(AiBriefService.class);

    private final String region;
    private final String modelId;
    private final boolean configured;
    private final Map<String, CacheEntry> lastGoodByVessel = new ConcurrentHashMap<>();
    private volatile BedrockRuntimeClient client;

    public AiBriefService(
            @Value("${AWS_REGION:}") String region,
            @Value("${FLEETMIND_BEDROCK_MODEL_ID:}") String modelId) {
        this.region = region == null ? "" : region.trim();
        this.modelId = modelId == null ? "" : modelId.trim();
        this.configured = !this.region.isBlank() && !this.modelId.isBlank();
    }

    @PostConstruct
    void reportConfiguration() {
        if (!configured) {
            LOGGER.warn("Bedrock disabled, deterministic fallback active");
        }
    }

    public Result generateBrief(
            String vesselId,
            BeforeAfterDto beforeAfter,
            List<UnderwaterEventDto> events,
            List<CitedMetricDto> citations) {
        return generateBrief(vesselId, beforeAfter, events, citations, false);
    }

    public Result generateBrief(
            String vesselId,
            BeforeAfterDto beforeAfter,
            List<UnderwaterEventDto> events,
            List<CitedMetricDto> citations,
            boolean lowConfidence) {
        String fallback = deterministicFallback(vesselId, citations);
        if (!configured) {
            return validatedResult("deterministic-fallback", fallback, citations);
        }

        try {
            String prompt = AiBriefPrompt.systemPrompt() + "\n\n"
                    + AiBriefPrompt.buildUserPrompt(vesselId, beforeAfter, events, citations, lowConfidence);
            ConverseResponse response = client().converse(ConverseRequest.builder()
                    .modelId(modelId)
                    .messages(Message.builder()
                            .role(ConversationRole.USER)
                            .content(ContentBlock.fromText(prompt))
                            .build())
                    .inferenceConfig(InferenceConfiguration.builder()
                            .maxTokens(600)
                            .temperature(0.2F)
                            .build())
                    .build());
            String text = response.output().message().content().stream()
                    .map(ContentBlock::text)
                    .filter(java.util.Objects::nonNull)
                    .reduce("", String::concat)
                    .trim();
            AiBriefGuardrailDto guardrail = AiBriefGuardrail.validate(text, citations);
            if (guardrail.passed()) {
                lastGoodByVessel.put(vesselId, new CacheEntry(text, List.copyOf(citations)));
                return new Result("bedrock", text, List.copyOf(citations), guardrail);
            }
            LOGGER.warn("Bedrock brief rejected for vessel {}: {}", vesselId, guardrail.violations());
            return fallbackAfterFailure(vesselId, fallback, citations);
        } catch (Exception exception) {
            LOGGER.warn("Bedrock brief failed for vessel {}: {}: {}",
                    vesselId, exception.getClass().getSimpleName(), exception.getMessage());
            return fallbackAfterFailure(vesselId, fallback, citations);
        }
    }

    private Result fallbackAfterFailure(String vesselId, String fallback, List<CitedMetricDto> citations) {
        CacheEntry cached = lastGoodByVessel.get(vesselId);
        if (cached != null) {
            return validatedResult("cached-bedrock", cached.text(), cached.citations());
        }
        return validatedResult("deterministic-fallback", fallback, citations);
    }

    private Result validatedResult(String mode, String text, List<CitedMetricDto> citations) {
        List<CitedMetricDto> safeCitations = List.copyOf(citations);
        return new Result(mode, text, safeCitations, AiBriefGuardrail.validate(text, safeCitations));
    }

    private BedrockRuntimeClient client() {
        BedrockRuntimeClient current = client;
        if (current == null) {
            synchronized (this) {
                current = client;
                if (current == null) {
                    client = current = buildClient();
                }
            }
        }
        return current;
    }

    private BedrockRuntimeClient buildClient() {
        ClientOverrideConfiguration overrides = ClientOverrideConfiguration.builder()
                .apiCallAttemptTimeout(Duration.ofSeconds(10))
                .apiCallTimeout(Duration.ofSeconds(12))
                .retryPolicy(RetryPolicy.builder().numRetries(1).build())
                .build();
        return BedrockRuntimeClient.builder()
                .region(Region.of(region))
                .httpClientBuilder(apacheHttpClientBuilder(Duration.ofSeconds(4)))
                .overrideConfiguration(overrides)
                .build();
    }

    /* The service module supplies the SDK's default Apache client at runtime. Reflection avoids
       adding a second HTTP-client dependency merely to set its connection timeout. */
    private SdkHttpClient.Builder apacheHttpClientBuilder(Duration connectTimeout) {
        try {
            Class<?> apacheClient = Class.forName("software.amazon.awssdk.http.apache.ApacheHttpClient");
            Object builder = apacheClient.getMethod("builder").invoke(null);
            Class<?> builderType = Class.forName("software.amazon.awssdk.http.apache.ApacheHttpClient$Builder");
            Method connectionTimeout = builderType.getMethod("connectionTimeout", Duration.class);
            connectionTimeout.invoke(builder, connectTimeout);
            return (SdkHttpClient.Builder) builder;
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("AWS SDK Apache HTTP client unavailable", exception);
        }
    }

    private String deterministicFallback(String vesselId, List<CitedMetricDto> citations) {
        Map<String, String> values = new java.util.HashMap<>();
        citations.forEach(metric -> values.put(metric.metricId(), metric.value()));
        return vesselId + " shows speed loss under comparable conditions. "
                + "The deterministic calculation estimates " + values.get("latest_speed_loss_pct")
                + "% speed loss [latest_speed_loss_pct] and "
                + values.get("fuel_penalty_pct")
                + "% same-speed fuel penalty [fuel_penalty_pct]. Recommend UWILD first; "
                + "clean only when inspection evidence and hull attribution support it.";
    }

    public record Result(
            String mode,
            String text,
            List<CitedMetricDto> citations,
            AiBriefGuardrailDto guardrail) {
    }

    private record CacheEntry(String text, List<CitedMetricDto> citations) {
    }
}
