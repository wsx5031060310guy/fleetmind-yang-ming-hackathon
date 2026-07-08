package com.fleetmind.corecalc;

import java.util.Objects;

public final class FuelMass {
    private final FuelType type;
    private final double massMetricTons;

    public FuelMass(FuelType type, double massMetricTons) {
        this.type = Objects.requireNonNull(type, "type");
        this.massMetricTons = massMetricTons;
    }

    public FuelType type() {
        return type;
    }

    public double massMetricTons() {
        return massMetricTons;
    }
}
