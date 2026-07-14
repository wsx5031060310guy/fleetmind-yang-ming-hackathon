package com.fleetmind.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Simple admin backend: read the whole settings document and patch it. Channel
 * "configured" state (SNS/SES/webhook) is composed from AlertNotificationService so
 * the UI can show whether an enabled channel can actually deliver.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminSettingsService settings;
    private final AlertNotificationService alerts;

    public AdminController(AdminSettingsService settings, AlertNotificationService alerts) {
        this.settings = settings;
        this.alerts = alerts;
    }

    @GetMapping("/settings")
    public AdminSettingsDto get() {
        return snapshot();
    }

    @PutMapping("/settings")
    public AdminSettingsDto update(@RequestBody(required = false) AdminSettingsUpdateDto body) {
        settings.update(body);
        return snapshot();
    }

    private AdminSettingsDto snapshot() {
        return settings.snapshot(alerts.configured(),
                alerts.sesConfigured(settings.emailRecipients()), alerts.webhookConfigured());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleBadRequest(IllegalArgumentException exception) {
        return Map.of("status", "bad_request", "message", String.valueOf(exception.getMessage()));
    }
}
