package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.PortalDtos.*;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.ConsultantService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/consultants")
public class AdminConsultantController {
    private final ConsultantService service;

    public AdminConsultantController(ConsultantService service) { this.service = service; }

    @GetMapping
    public List<ConsultantResponse> all() { return service.all(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConsultantResponse create(@Valid @RequestBody CreateConsultantRequest request, Authentication auth) {
        return service.create(request.name(), "ADMIN", username(auth));
    }

    @PatchMapping("/{id}")
    public ConsultantResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateConsultantRequest request,
            Authentication auth
    ) {
        return service.update(id, request.name(), request.active(), username(auth));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        service.delete(id, username(auth));
    }

    private String username(Authentication auth) {
        return ((PortalPrincipal) auth.getPrincipal()).username();
    }
}
