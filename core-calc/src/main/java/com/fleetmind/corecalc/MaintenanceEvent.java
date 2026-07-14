package com.fleetmind.corecalc;

import java.time.LocalDate;
import java.util.Objects;

public final class MaintenanceEvent {
    public enum EventType {
        PP(false, true),
        UWI_PP(false, true),
        UWC(true, false),
        UWC_PP(true, true),
        DD(true, true),
        UWI(false, false);

        private final boolean resetsHull;
        private final boolean resetsPropeller;

        EventType(boolean resetsHull, boolean resetsPropeller) {
            this.resetsHull = resetsHull;
            this.resetsPropeller = resetsPropeller;
        }

        public boolean resetsHull() {
            return resetsHull;
        }

        public boolean resetsPropeller() {
            return resetsPropeller;
        }
    }

    private final String shipId;
    private final int dayIndex;
    private final EventType type;

    public MaintenanceEvent(String shipId, int dayIndex, EventType type) {
        this.shipId = Objects.requireNonNull(shipId, "shipId");
        this.dayIndex = dayIndex;
        this.type = Objects.requireNonNull(type, "type");
    }

    public static MaintenanceEvent fromDate(String shipId, LocalDate date, EventType type) {
        Objects.requireNonNull(date, "date");
        return new MaintenanceEvent(shipId, Math.toIntExact(date.toEpochDay()), type);
    }

    public static MaintenanceEvent of(String shipId, LocalDate date, EventType type) {
        return fromDate(shipId, date, type);
    }

    public static MaintenanceEvent fromLocalDate(String shipId, LocalDate date, EventType type) {
        return fromDate(shipId, date, type);
    }

    public String shipId() {
        return shipId;
    }

    public int dayIndex() {
        return dayIndex;
    }

    public LocalDate date() {
        return LocalDate.ofEpochDay(dayIndex);
    }

    public EventType type() {
        return type;
    }

    public boolean resetsHull() {
        return type.resetsHull();
    }

    public boolean resetsPropeller() {
        return type.resetsPropeller();
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof MaintenanceEvent event)) {
            return false;
        }
        return dayIndex == event.dayIndex && shipId.equals(event.shipId) && type == event.type;
    }

    @Override
    public int hashCode() {
        return Objects.hash(shipId, dayIndex, type);
    }

    @Override
    public String toString() {
        return "MaintenanceEvent[shipId=" + shipId + ", dayIndex=" + dayIndex + ", type=" + type + "]";
    }
}
