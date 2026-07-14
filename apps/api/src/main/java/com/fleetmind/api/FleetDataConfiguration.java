package com.fleetmind.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class FleetDataConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetDataConfiguration.class);

    @Bean
    @Primary
    FleetDataProvider fleetDataProvider(
            @Value("${fleetmind.metrics-file:${FLEETMIND_METRICS_FILE:}}") String metricsFile,
            ObjectMapper objectMapper,
            AiBriefService aiBriefService,
            DemoDataService demoDataService) throws IOException {
        if (metricsFile == null || metricsFile.isBlank()) {
            LOGGER.info("FLEETMIND_METRICS_FILE unset; using demo dataset");
            return demoDataService;
        }
        Path path = Path.of(metricsFile).toAbsolutePath().normalize();
        if (!Files.isRegularFile(path)) {
            LOGGER.warn("Metrics file {} does not exist; using demo dataset", path);
            return demoDataService;
        }
        LOGGER.info("Loading real fleet metrics from {}", path);
        return new RealDataService(path, objectMapper, aiBriefService, demoDataService);
    }
}
