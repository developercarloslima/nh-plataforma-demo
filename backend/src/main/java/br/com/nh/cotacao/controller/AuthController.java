package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.security.AccessTokenService;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.security.PortalRole;
import br.com.nh.cotacao.service.PortalUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AccessTokenService tokenService;
    private final PortalUserService portalUserService;

    public AuthController(AccessTokenService tokenService, PortalUserService portalUserService) {
        this.tokenService = tokenService;
        this.portalUserService = portalUserService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        try {
            var authenticated = portalUserService.authenticate(request.username(), request.password());
            var issued = tokenService.issue(authenticated.username(), authenticated.role());
            return new LoginResponse(
                    issued.token(), authenticated.role(), Instant.ofEpochSecond(issued.expiresAtEpochSecond()),
                    authenticated.consultantId(), authenticated.consultantName()
            );
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuário ou senha inválidos.");
        }
    }

    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        PortalPrincipal principal = (PortalPrincipal) authentication.getPrincipal();
        var session = portalUserService.session(principal.username());
        return new MeResponse(
                session.username(), session.displayName(), session.role(), session.consultantId(), session.consultantName()
        );
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record LoginResponse(
            String token, PortalRole role, Instant expiresAt, java.util.UUID consultantId, String consultantName
    ) {}
    public record MeResponse(
            String username, String displayName, PortalRole role, java.util.UUID consultantId, String consultantName
    ) {}
}
