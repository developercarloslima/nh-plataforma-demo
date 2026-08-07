package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.AdminUserDtos.*;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.PortalUserService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {
    private final PortalUserService service;

    public AdminUserController(PortalUserService service) {
        this.service = service;
    }

    @GetMapping
    public List<PortalUserResponse> list() {
        return service.list();
    }

    @PostMapping
    public PortalUserResponse create(@Valid @RequestBody CreatePortalUserRequest request, Authentication auth) {
        return service.create(request, username(auth));
    }

    @PatchMapping("/{id}")
    public PortalUserResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdatePortalUserRequest request,
            Authentication auth
    ) {
        return service.update(id, request, username(auth));
    }

    @PatchMapping("/{id}/password")
    public PortalUserResponse changePassword(
            @PathVariable UUID id,
            @Valid @RequestBody ChangePortalUserPasswordRequest request,
            Authentication auth
    ) {
        return service.changePassword(id, request, username(auth));
    }

    private String username(Authentication auth) {
        return ((PortalPrincipal) auth.getPrincipal()).username();
    }
}
