package com.fleetmind.corecalc;

public enum FuelType {
    MGO(42.7),
    ULSFO(41.2),
    HFO(40.2),
    VLSFO(40.2);

    private final double lcv;

    FuelType(double lcv) {
        this.lcv = lcv;
    }

    public double lcv() {
        return lcv;
    }
}
