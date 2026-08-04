package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.AdminDtos.CommunicationSettingsResponse;
import br.com.nh.cotacao.dto.AdminDtos.UpdateCommunicationSettingsRequest;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.CommunicationSettingsService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingsController {
    private final CommunicationSettingsService service;

    public AdminSettingsController(CommunicationSettingsService service) { this.service = service; }

    @GetMapping("/communications")
    public CommunicationSettingsResponse get() { return service.get(); }

    @PutMapping("/communications")
    public CommunicationSettingsResponse update(
            @Valid @RequestBody UpdateCommunicationSettingsRequest request,
            Authentication auth
    ) {
        return service.update(request, ((PortalPrincipal) auth.getPrincipal()).username());
    }
}
