package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.AdminUserDtos.*;
import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.entity.PortalUser;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.PortalUserRepository;
import br.com.nh.cotacao.security.PortalRole;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class PortalUserService {
    private final PortalUserRepository repository;
    private final CatalogChangeAuditRepository auditRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public PortalUserService(PortalUserRepository repository, CatalogChangeAuditRepository auditRepository) {
        this.repository = repository;
        this.auditRepository = auditRepository;
    }

    @Transactional
    public AuthenticatedPortalUser authenticate(String username, String password) {
        PortalUser user = repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .orElseThrow(() -> new IllegalArgumentException("Usuário ou senha inválidos."));
        if (!user.isActive() || !encoder.matches(password == null ? "" : password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Usuário ou senha inválidos.");
        }
        user.registerLogin();
        repository.flush();
        return new AuthenticatedPortalUser(user.getUsername(), user.getRole());
    }

    @Transactional(readOnly = true)
    public boolean isActiveWithRole(String username, PortalRole role) {
        return repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .filter(PortalUser::isActive)
                .map(user -> user.getRole() == role)
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public List<PortalUserResponse> list() {
        return repository.findAllByOrderByRoleAscUsernameAsc().stream().map(this::toResponse).toList();
    }

    @Transactional
    public PortalUserResponse create(CreatePortalUserRequest request, String adminUsername) {
        String normalized = PortalUser.normalizeUsername(request.username());
        repository.findByNormalizedUsername(normalized).ifPresent(existing -> {
            throw new IllegalArgumentException("Já existe uma conta com esse usuário.");
        });
        validatePassword(request.password());
        PortalUser user = PortalUser.create(
                request.username(), request.displayName(), encoder.encode(request.password()), request.role(), adminUsername
        );
        PortalUser saved = repository.save(user);
        auditRepository.save(CatalogChangeAudit.createText(
                "PORTAL_USER", null, saved.getId().toString(),
                "Conta de acesso criada — " + saved.getUsername(), null, summary(saved), adminUsername
        ));
        return toResponse(saved);
    }

    @Transactional
    public PortalUserResponse update(UUID id, UpdatePortalUserRequest request, String adminUsername) {
        PortalUser user = find(id);
        String old = summary(user);
        String requestedUsername = request.username();
        if (requestedUsername != null && !requestedUsername.isBlank()) {
            String normalized = PortalUser.normalizeUsername(requestedUsername);
            repository.findByNormalizedUsername(normalized).ifPresent(existing -> {
                if (!existing.getId().equals(id)) throw new IllegalArgumentException("Já existe uma conta com esse usuário.");
            });
        }

        PortalRole nextRole = request.role() == null ? user.getRole() : request.role();
        boolean nextActive = request.active() == null ? user.isActive() : request.active();
        protectLastAdmin(user, nextRole, nextActive);

        user.updateProfile(requestedUsername, request.displayName(), request.role());
        if (request.active() != null) user.setActive(request.active());
        PortalUser saved = repository.save(user);
        auditRepository.save(CatalogChangeAudit.createText(
                "PORTAL_USER", null, saved.getId().toString(),
                "Conta de acesso alterada — " + saved.getUsername(), old, summary(saved), adminUsername
        ));
        return toResponse(saved);
    }

    @Transactional
    public PortalUserResponse changePassword(UUID id, ChangePortalUserPasswordRequest request, String adminUsername) {
        PortalUser user = find(id);
        validatePassword(request.password());
        user.changePassword(encoder.encode(request.password()));
        PortalUser saved = repository.save(user);
        auditRepository.save(CatalogChangeAudit.createText(
                "PORTAL_USER", null, saved.getId().toString(),
                "Senha da conta alterada — " + saved.getUsername(), "senha anterior protegida", "nova senha protegida por BCrypt", adminUsername
        ));
        return toResponse(saved);
    }

    @Transactional
    public void bootstrapDefaults(
            String adminUsername, String adminPassword,
            String analystUsername, String analystPassword,
            String consultantUsername, String consultantPassword
    ) {
        // O bootstrap acontece uma única vez. Depois disso, o banco passa a ser a fonte
        // de verdade e alterações feitas pelo administrador não são revertidas pelo .env.
        if (repository.count() > 0) return;
        createBootstrapUser(adminUsername, "Administrador principal", adminPassword, PortalRole.ADMIN);
        createBootstrapUser(analystUsername, "Equipe de análise", analystPassword, PortalRole.ANALYST);
        createBootstrapUser(consultantUsername, "Portal de consultores", consultantPassword, PortalRole.CONSULTANT);
    }

    private void createBootstrapUser(String username, String displayName, String configuredPassword, PortalRole role) {
        String normalized = PortalUser.normalizeUsername(username);
        if (normalized.isBlank()) throw new IllegalStateException("Usuário inicial de " + role + " não foi configurado.");
        if (repository.findByNormalizedUsername(normalized).isPresent()) {
            throw new IllegalStateException("Os usuários iniciais dos portais precisam ser diferentes entre si.");
        }
        String hash = configuredPassword != null && configuredPassword.startsWith("$2")
                ? configuredPassword
                : encoder.encode(configuredPassword == null ? "" : configuredPassword);
        repository.save(PortalUser.create(username, displayName, hash, role, "BOOTSTRAP"));
    }

    private void protectLastAdmin(PortalUser user, PortalRole nextRole, boolean nextActive) {
        if (user.getRole() != PortalRole.ADMIN || !user.isActive()) return;
        boolean losesAdmin = nextRole != PortalRole.ADMIN || !nextActive;
        if (losesAdmin && repository.countByRoleAndActiveTrue(PortalRole.ADMIN) <= 1) {
            throw new IllegalArgumentException("Não é possível remover ou desativar o último administrador ativo.");
        }
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("A senha deve ter pelo menos 8 caracteres.");
        }
        if (password.length() > 120) throw new IllegalArgumentException("A senha é muito longa.");
    }

    private PortalUser find(UUID id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Conta de acesso não encontrada."));
    }

    private PortalUserResponse toResponse(PortalUser user) {
        return new PortalUserResponse(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getRole(), user.isActive(),
                user.getCreatedAt(), user.getUpdatedAt(), user.getPasswordChangedAt(), user.getLastLoginAt(), user.getCreatedBy()
        );
    }

    private String summary(PortalUser user) {
        return "usuario=" + user.getUsername() + "; perfil=" + user.getRole() + "; ativo=" + user.isActive();
    }

    public record AuthenticatedPortalUser(String username, PortalRole role) {}
}
