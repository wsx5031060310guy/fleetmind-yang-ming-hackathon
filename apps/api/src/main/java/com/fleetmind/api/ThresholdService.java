package com.fleetmind.api;

import com.fleetmind.corecalc.DecisionSupport;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicReference;

@Service
public final class ThresholdService {
    private final AtomicReference<Double> thresholdPct = new AtomicReference<>(
            DecisionSupport.DEFAULT_THRESHOLD_PCT);

    public double get() {
        return thresholdPct.get();
    }

    public double set(double value) {
        if (!Double.isFinite(value) || value <= 0.0 || value > 50.0) {
            throw new ThresholdValidationException("threshold must satisfy 0 < value <= 50");
        }
        thresholdPct.set(value);
        return value;
    }

    public static final class ThresholdValidationException extends IllegalArgumentException {
        public ThresholdValidationException(String message) {
            super(message);
        }
    }
}
