package com.fleetmind.api;

import java.time.LocalDate;

public record UnderwaterEventDto(
        String eventId,
        String vesselId,
        LocalDate date,
        String type) {
}
