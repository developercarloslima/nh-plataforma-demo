package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.AdminDtos.AdminInspectionResponse;
import br.com.nh.cotacao.dto.AdminDtos.UpdateInspectionStatusRequest;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.AdminActivityService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/supervision/inspections")
public class SupervisionAnalysisController {
    private final AdminActivityService service;

    public SupervisionAnalysisController(AdminActivityService service) {
        this.service = service;
    }

    @GetMapping
    public List<AdminInspectionResponse> list() {
        return service.inspectionsForSupervision();
    }

    @PatchMapping("/{id}/status")
    public AdminInspectionResponse updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateInspectionStatusRequest request,
            Authentication authentication
    ) {
        PortalPrincipal principal = (PortalPrincipal) authentication.getPrincipal();
        return service.updateInspectionStatusForSupervision(id, request, principal.username(), principal.role());
    }

    @PostMapping("/{id}/decision-message-sent")
    public AdminInspectionResponse markDecisionMessageSent(@PathVariable UUID id, Authentication authentication) {
        PortalPrincipal principal = (PortalPrincipal) authentication.getPrincipal();
        return service.markDecisionMessageSentForSupervision(id, principal.username(), principal.role());
    }
}
