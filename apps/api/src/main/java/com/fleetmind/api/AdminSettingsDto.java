package com.fleetmind.api;

import java.util.List;
import java.util.Map;

/**
 * Full read view of the admin settings, returned by GET/PUT /api/admin/settings.
 * {@code snsConfigured}/{@code webhookConfigured} are live env-derived facts (not
 * stored settings) surfaced here so the admin UI can show whether each channel can
 * actually deliver.
 */
public record AdminSettingsDto(
        double thresholdPct,
        int alertHorizonDays,
        List<String> channels,
        List<String> emailRecipients,
        String snsTopicArn,
        String notifySchedule,
        Map<String, String> fuelTypeMapping,
        String fuelTypeDefault,
        String dataSourceMode,
        boolean snsConfigured,
        boolean sesConfigured,
        boolean webhookConfigured) {
}
