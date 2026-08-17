package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.AdminDtos.AdminInspectionResponse;
import br.com.nh.cotacao.dto.AdminDtos.UpdateInspectionStatusRequest;
import br.com.nh.cotacao.dto.PortalDtos.ConsultantResponse;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.AdminActivityService;
import br.com.nh.cotacao.service.ConsultantService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/analysis/inspections")
public class AnalysisInspectionController {
    private final AdminActivityService service;
    private final ConsultantService consultantService;

    public AnalysisInspectionController(AdminActivityService service, ConsultantService consultantService) {
        this.service = service;
        this.consultantService = consultantService;
    }

    @GetMapping
    public List<AdminInspectionResponse> list() {
        return service.inspectionsForAnalysis();
    }

    @GetMapping("/analysts")
    public List<ConsultantResponse> analysts() {
        return consultantService.activeAnalysts();
    }

    @PostMapping("/{id}/decision-message-sent")
    public AdminInspectionResponse markDecisionMessageSent(@PathVariable UUID id) {
        return service.markDecisionMessageSentForAnalysis(id);
    }

    @PatchMapping("/{id}/status")
    public AdminInspectionResponse updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateInspectionStatusRequest request,
            Authentication authentication
    ) {
        PortalPrincipal principal = (PortalPrincipal) authentication.getPrincipal();
        return service.updateInspectionStatusForAnalysis(id, request, principal.username(), principal.role());
    }
}
