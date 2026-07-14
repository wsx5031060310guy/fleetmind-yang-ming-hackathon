package com.fleetmind.api;

import java.util.List;
import java.util.Map;

/**
 * Partial update payload for PUT /api/admin/settings. Every field is nullable:
 * only non-null fields are validated and applied, so callers may patch a single
 * setting without resending the whole document.
 */
public record AdminSettingsUpdateDto(
        Double thresholdPct,
        Integer alertHorizonDays,
        List<String> channels,
        List<String> emailRecipients,
        String snsTopicArn,
        String notifySchedule,
        Map<String, String> fuelTypeMapping,
        String fuelTypeDefault,
        String dataSourceMode) {
}
