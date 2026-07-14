package com.fleetmind.api;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public final class AlertNotificationService {
    private static final Logger LOGGER = LoggerFactory.getLogger(AlertNotificationService.class);

    private final String topicArn;
    private final String region;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "fleetmind-sns-alert");
        thread.setDaemon(true);
        return thread;
    });
    private volatile SnsClient client;

    public AlertNotificationService(
            @Value("${FLEETMIND_ALERT_TOPIC_ARN:}") String topicArn,
            @Value("${AWS_REGION:}") String region) {
        this.topicArn = topicArn == null ? "" : topicArn.trim();
        this.region = region == null ? "" : region.trim();
    }

    public boolean configured() {
        return !topicArn.isBlank();
    }

    public void publishAsync(double thresholdPct, List<DecisionDto> alerts) {
        if (!configured()) {
            return;
        }
        List<DecisionDto> snapshot = List.copyOf(alerts);
        executor.submit(() -> {
            try {
                client().publish(PublishRequest.builder()
                        .topicArn(topicArn)
                        .subject("FleetMind vessel alerts")
                        .message(message(thresholdPct, snapshot))
                        .build());
            } catch (Exception exception) {
                LOGGER.warn("SNS alert publish failed: {}: {}",
                        exception.getClass().getSimpleName(), exception.getMessage());
            }
        });
    }

    private String message(double thresholdPct, List<DecisionDto> alerts) {
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

    private SnsClient client() {
        SnsClient current = client;
        if (current == null) {
            synchronized (this) {
                current = client;
                if (current == null) {
                    String effectiveRegion = region.isBlank() ? regionFromArn(topicArn) : region;
                    client = current = SnsClient.builder()
                            .region(Region.of(effectiveRegion))
                            .overrideConfiguration(ClientOverrideConfiguration.builder()
                                    .apiCallAttemptTimeout(Duration.ofSeconds(3))
                                    .apiCallTimeout(Duration.ofSeconds(5))
                                    .retryPolicy(RetryPolicy.builder().numRetries(1).build())
                                    .build())
                            .build();
                }
            }
        }
        return current;
    }

    private static String regionFromArn(String arn) {
        String[] parts = arn.split(":", -1);
        if (parts.length > 3 && !parts[3].isBlank()) {
            return parts[3];
        }
        throw new IllegalArgumentException("SNS topic ARN has no region and AWS_REGION is unset");
    }

    @PreDestroy
    void close() {
        executor.shutdown();
        SnsClient current = client;
        if (current != null) {
            current.close();
        }
    }
}
