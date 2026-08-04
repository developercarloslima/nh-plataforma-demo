package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.ConsultantDashboardDtos.ConsultantDashboardResponse;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.ConsultantInspectionSummary;
import br.com.nh.cotacao.service.ConsultantDashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/consultant-dashboard")
public class ConsultantDashboardController {
    private final ConsultantDashboardService service;

    public ConsultantDashboardController(ConsultantDashboardService service) {
        this.service = service;
    }

    @GetMapping("/{consultantId}")
    public ConsultantDashboardResponse dashboard(@PathVariable UUID consultantId) {
        return service.dashboard(consultantId);
    }

    @PostMapping("/inspections/{inspectionId}/completion-message-sent")
    public ConsultantInspectionSummary markCompletionMessageSent(@PathVariable UUID inspectionId) {
        return service.markCompletionMessageSent(inspectionId);
    }
}
