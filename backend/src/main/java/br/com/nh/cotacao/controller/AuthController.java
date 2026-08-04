package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.security.AccessTokenService;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.security.PortalRole;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AccessTokenService tokenService;
    private final String consultantUsername;
    private final String consultantPassword;
    private final String analystUsername;
    private final String analystPassword;
    private final String adminUsername;
    private final String adminPassword;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthController(
            AccessTokenService tokenService,
            @Value("${app.auth.consultant-username}") String consultantUsername,
            @Value("${app.auth.consultant-password}") String consultantPassword,
            @Value("${app.auth.analyst-username}") String analystUsername,
            @Value("${app.auth.analyst-password}") String analystPassword,
            @Value("${app.auth.admin-username}") String adminUsername,
            @Value("${app.auth.admin-password}") String adminPassword
    ) {
        this.tokenService = tokenService;
        this.consultantUsername = consultantUsername;
        this.consultantPassword = consultantPassword;
        this.analystUsername = analystUsername;
        this.analystPassword = analystPassword;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        PortalRole role;
        if (constantEquals(request.username(), adminUsername) && passwordMatches(request.password(), adminPassword)) {
            role = PortalRole.ADMIN;
        } else if (constantEquals(request.username(), analystUsername) && passwordMatches(request.password(), analystPassword)) {
            role = PortalRole.ANALYST;
        } else if (constantEquals(request.username(), consultantUsername) && passwordMatches(request.password(), consultantPassword)) {
            role = PortalRole.CONSULTANT;
        } else {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuário ou senha inválidos.");
        }
        var issued = tokenService.issue(request.username(), role);
        return new LoginResponse(issued.token(), role, Instant.ofEpochSecond(issued.expiresAtEpochSecond()));
    }

    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        PortalPrincipal principal = (PortalPrincipal) authentication.getPrincipal();
        return new MeResponse(principal.username(), principal.role());
    }

    private boolean passwordMatches(String provided, String configured) {
        if (configured != null && configured.startsWith("$2")) {
            return encoder.matches(provided, configured);
        }
        return constantEquals(provided, configured);
    }

    private boolean constantEquals(String left, String right) {
        if (left == null || right == null) return false;
        return java.security.MessageDigest.isEqual(
                left.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                right.getBytes(java.nio.charset.StandardCharsets.UTF_8)
        );
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record LoginResponse(String token, PortalRole role, Instant expiresAt) {}
    public record MeResponse(String username, PortalRole role) {}
}
