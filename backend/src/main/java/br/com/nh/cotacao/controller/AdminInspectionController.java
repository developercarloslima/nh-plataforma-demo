package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.AdminDtos.AdminInspectionResponse;
import br.com.nh.cotacao.dto.AdminDtos.DeleteSummary;
import br.com.nh.cotacao.dto.AdminDtos.UpdateInspectionStatusRequest;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.AdminActivityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/inspections")
public class AdminInspectionController {
    private final AdminActivityService service;

    public AdminInspectionController(AdminActivityService service) { this.service = service; }

    @GetMapping
    public List<AdminInspectionResponse> list() { return service.inspections(); }

    @PatchMapping("/{id}/status")
    public AdminInspectionResponse updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateInspectionStatusRequest request,
            Authentication auth
    ) {
        return service.updateInspectionStatus(id, request, username(auth));
    }


    @PostMapping("/{id}/registration-complete")
    public AdminInspectionResponse registrationComplete(
            @PathVariable UUID id,
            @Valid @RequestBody AdminInspectionNoteRequest request,
            Authentication auth
    ) {
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        return service.markRegistrationCompleted(id, request.note(), principal.username(), principal.role());
    }

    @PostMapping("/{id}/registration-not-complete")
    public AdminInspectionResponse registrationNotComplete(
            @PathVariable UUID id,
            @Valid @RequestBody AdminInspectionNoteRequest request,
            Authentication auth
    ) {
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        return service.markRegistrationNotCompleted(id, request.note(), principal.username(), principal.role());
    }

    @PatchMapping("/{id}/supervision-note")
    public AdminInspectionResponse updateSupervisionNote(
            @PathVariable UUID id,
            @Valid @RequestBody AdminInspectionNoteRequest request,
            Authentication auth
    ) {
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        return service.updateSupervisionNote(id, request.note(), principal.username(), principal.role());
    }

    @PatchMapping("/{id}/supervision-status")
    public AdminInspectionResponse updateSupervisionStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateInspectionStatusRequest request,
            Authentication auth
    ) {
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        return service.updateInspectionStatusForSupervision(id, request, principal.username(), principal.role());
    }

    @PostMapping("/{id}/decision-message-sent")
    public AdminInspectionResponse markDecisionMessageSent(@PathVariable UUID id, Authentication auth) {
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        return service.markDecisionMessageSentForSupervision(id, principal.username(), principal.role());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        service.deleteInspection(id, username(auth));
    }

    @DeleteMapping
    public DeleteSummary deleteAllAllowed(Authentication auth) {
        return service.deleteAllAllowedInspections(username(auth));
    }

    public record AdminInspectionNoteRequest(@Size(max = 1200) String note) {}

    private String username(Authentication auth) {
        return ((PortalPrincipal) auth.getPrincipal()).username();
    }
}
