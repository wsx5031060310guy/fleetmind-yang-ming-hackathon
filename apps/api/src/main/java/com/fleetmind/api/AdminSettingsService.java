package com.fleetmind.api;

import com.fleetmind.corecalc.DecisionSupport;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * In-memory, thread-safe admin settings store, in the same AtomicReference style as
 * ThresholdService. thresholdPct is deliberately NOT stored here: it is delegated to
 * ThresholdService so the app keeps a single source of truth for the decision
 * threshold (read and write both go through ThresholdService).
 *
 * <p>A production build must persist these settings in DynamoDB / SSM Parameter Store
 * (see futureRoadmap) so they survive Fargate redeploys and stay consistent across
 * scaled-out tasks. {@code snsTopicArn} here is the intended/display value; the live
 * SNS transport is env-driven inside AlertNotificationService and is not re-pointed by
 * editing this field at runtime.
 */
@Service
public final class AdminSettingsService {
    private static final Set<String> ALLOWED_CHANNELS = Set.of("email", "sns", "ses", "webhook");
    private static final Set<String> ALLOWED_MODES = Set.of("baked", "upload", "apiPush");
    private static final int MAX_HORIZON_DAYS = 365;

    private final ThresholdService thresholdService;
    private final AtomicInteger alertHorizonDays =
            new AtomicInteger(DecisionSupport.DEFAULT_ALERT_HORIZON_DAYS);
    private final AtomicReference<Set<String>> channels = new AtomicReference<>(Set.of("sns"));
    private final AtomicReference<List<String>> emailRecipients = new AtomicReference<>(List.of());
    private final AtomicReference<String> snsTopicArn;
    private final AtomicReference<String> notifySchedule = new AtomicReference<>("30 12 * * *");
    private final AtomicReference<Map<String, String>> fuelTypeMapping =
            new AtomicReference<>(defaultFuelMapping());
    private final AtomicReference<String> fuelTypeDefault = new AtomicReference<>("VLSFO");
    private final AtomicReference<String> dataSourceMode = new AtomicReference<>("baked");

    public AdminSettingsService(
            ThresholdService thresholdService,
            @Value("${FLEETMIND_ALERT_TOPIC_ARN:}") String snsTopicArn) {
        this.thresholdService = thresholdService;
        this.snsTopicArn = new AtomicReference<>(snsTopicArn == null ? "" : snsTopicArn.trim());
    }

    public double thresholdPct() {
        return thresholdService.get();
    }

    public int alertHorizonDays() {
        return alertHorizonDays.get();
    }

    public Set<String> channels() {
        return channels.get();
    }

    public List<String> emailRecipients() {
        return emailRecipients.get();
    }

    public String snsTopicArn() {
        return snsTopicArn.get();
    }

    public String notifySchedule() {
        return notifySchedule.get();
    }

    public Map<String, String> fuelTypeMapping() {
        return fuelTypeMapping.get();
    }

    public String fuelTypeDefault() {
        return fuelTypeDefault.get();
    }

    public String dataSourceMode() {
        return dataSourceMode.get();
    }

    public AdminSettingsDto snapshot(boolean snsConfigured, boolean sesConfigured,
            boolean webhookConfigured) {
        return new AdminSettingsDto(thresholdPct(), alertHorizonDays(),
                List.copyOf(channels()), emailRecipients(), snsTopicArn(), notifySchedule(),
                fuelTypeMapping(), fuelTypeDefault(), dataSourceMode(),
                snsConfigured, sesConfigured, webhookConfigured);
    }

    /**
     * Applies a partial update. All non-null fields are validated first; the
     * threshold (authoritatively validated by ThresholdService) is applied before any
     * other field so an invalid update leaves the store unchanged.
     */
    public void update(AdminSettingsUpdateDto update) {
        if (update == null) {
            return;
        }
        validate(update);

        if (update.thresholdPct() != null) {
            // ThresholdService is the single validator + source of truth; throws on bad range.
            thresholdService.set(update.thresholdPct());
        }
        if (update.alertHorizonDays() != null) {
            alertHorizonDays.set(update.alertHorizonDays());
        }
        if (update.channels() != null) {
            channels.set(Collections.unmodifiableSet(new LinkedHashSet<>(update.channels())));
        }
        if (update.emailRecipients() != null) {
            emailRecipients.set(List.copyOf(update.emailRecipients()));
        }
        if (update.snsTopicArn() != null) {
            snsTopicArn.set(update.snsTopicArn().trim());
        }
        if (update.notifySchedule() != null) {
            notifySchedule.set(update.notifySchedule().trim());
        }
        if (update.fuelTypeMapping() != null) {
            fuelTypeMapping.set(Collections.unmodifiableMap(
                    new LinkedHashMap<>(update.fuelTypeMapping())));
        }
        if (update.fuelTypeDefault() != null) {
            fuelTypeDefault.set(update.fuelTypeDefault().trim());
        }
        if (update.dataSourceMode() != null) {
            dataSourceMode.set(update.dataSourceMode());
        }
    }

    private void validate(AdminSettingsUpdateDto update) {
        Integer horizon = update.alertHorizonDays();
        if (horizon != null && (horizon < 1 || horizon > MAX_HORIZON_DAYS)) {
            throw new SettingsValidationException(
                    "alertHorizonDays must satisfy 1 <= value <= " + MAX_HORIZON_DAYS);
        }
        if (update.channels() != null) {
            for (String channel : update.channels()) {
                if (channel == null || !ALLOWED_CHANNELS.contains(channel)) {
                    throw new SettingsValidationException("unknown channel: " + channel);
                }
            }
        }
        if (update.emailRecipients() != null) {
            for (String recipient : update.emailRecipients()) {
                if (recipient == null || recipient.isBlank() || !recipient.contains("@")) {
                    throw new SettingsValidationException("invalid email recipient: " + recipient);
                }
            }
        }
        if (update.snsTopicArn() != null) {
            String arn = update.snsTopicArn().trim();
            if (!arn.isEmpty() && !arn.startsWith("arn:aws:sns:")) {
                throw new SettingsValidationException("snsTopicArn must start with arn:aws:sns:");
            }
        }
        if (update.notifySchedule() != null && update.notifySchedule().isBlank()) {
            throw new SettingsValidationException("notifySchedule must not be blank");
        }
        if (update.fuelTypeMapping() != null) {
            for (Map.Entry<String, String> entry : update.fuelTypeMapping().entrySet()) {
                if (entry.getKey() == null || entry.getKey().isBlank()
                        || entry.getValue() == null || entry.getValue().isBlank()) {
                    throw new SettingsValidationException("fuelTypeMapping keys/values must not be blank");
                }
            }
        }
        if (update.fuelTypeDefault() != null && update.fuelTypeDefault().isBlank()) {
            throw new SettingsValidationException("fuelTypeDefault must not be blank");
        }
        if (update.dataSourceMode() != null && !ALLOWED_MODES.contains(update.dataSourceMode())) {
            throw new SettingsValidationException(
                    "dataSourceMode must be one of baked|upload|apiPush");
        }
    }

    private static Map<String, String> defaultFuelMapping() {
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("VLSFO", "VLSFO");
        mapping.put("LSFO", "VLSFO");
        mapping.put("MGO", "MGO");
        mapping.put("LSMGO", "MGO");
        mapping.put("HSFO", "HSFO");
        return Collections.unmodifiableMap(mapping);
    }

    /** Bad settings payload -> HTTP 400 (subclass of IllegalArgumentException). */
    public static final class SettingsValidationException extends IllegalArgumentException {
        public SettingsValidationException(String message) {
            super(message);
        }
    }
}
