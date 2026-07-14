package com.fleetmind.api;

import java.util.List;

public interface FleetDataProvider {
    List<VesselSummaryDto> fleetSummary();

    List<DailyMetricDto> performance(String vesselId);

    List<UnderwaterEventDto> underwaterEvents(String vesselId);

    BeforeAfterDto beforeAfter(String vesselId, String eventId);

    DataQualityDto dataQuality();

    FuelConsumpExportDto fuelExport();

    AiBriefDto aiBrief(String vesselId, boolean forceFallback);

    AiBriefPromptDto aiBriefPrompt(String vesselId);
}
