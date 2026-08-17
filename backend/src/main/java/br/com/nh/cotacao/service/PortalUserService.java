package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.AdminUserDtos.*;
import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.entity.CollaboratorRole;
import br.com.nh.cotacao.entity.Consultant;
import br.com.nh.cotacao.entity.PortalUser;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.ConsultantRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.PortalUserRepository;
import br.com.nh.cotacao.security.PortalRole;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class PortalUserService {
    private final PortalUserRepository repository;
    private final CatalogChangeAuditRepository auditRepository;
    private final ConsultantRepository consultantRepository;
    private final InspectionRequestRepository inspectionRepository;
    private final ConsultantService consultantService;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public PortalUserService(
            PortalUserRepository repository,
            CatalogChangeAuditRepository auditRepository,
            ConsultantRepository consultantRepository,
            InspectionRequestRepository inspectionRepository,
            ConsultantService consultantService
    ) {
        this.repository = repository;
        this.auditRepository = auditRepository;
        this.consultantRepository = consultantRepository;
        this.inspectionRepository = inspectionRepository;
        this.consultantService = consultantService;
    }

    @Transactional
    public AuthenticatedPortalUser authenticate(String username, String password) {
        PortalUser user = repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .orElseThrow(() -> new IllegalArgumentException("Usuário ou senha inválidos."));
        if (!user.isActive() || !encoder.matches(password == null ? "" : password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Usuário ou senha inválidos.");
        }

        String consultantName = null;
        if (user.getConsultantId() != null) {
            if (user.getRole() == PortalRole.CONSULTANT) {
                // Contas específicas de consultor são identificadas automaticamente no login.
                var consultant = consultantService.registerPortalLogin(user.getConsultantId());
                consultantName = consultant.name();
            } else if (user.getRole() == PortalRole.ANALYST) {
                // O mesmo vínculo operacional é usado para identificar contas específicas de analista.
                var analyst = consultantService.findActiveAnalyst(user.getConsultantId());
                consultantName = analyst.getName();
            }
        }

        user.registerLogin();
        repository.flush();
        return new AuthenticatedPortalUser(user.getUsername(), user.getRole(), user.getConsultantId(), consultantName);
    }

    @Transactional(readOnly = true)
    public boolean isActiveWithRole(String username, PortalRole role) {
        return repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .filter(PortalUser::isActive)
                .map(user -> user.getRole() == role)
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public PortalUserSession session(String username) {
        PortalUser user = repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .filter(PortalUser::isActive)
                .orElseThrow(() -> new IllegalArgumentException("Conta de acesso não encontrada ou inativa."));
        return new PortalUserSession(
                user.getUsername(), user.getDisplayName(), user.getRole(), user.getConsultantId(), consultantName(user.getConsultantId())
        );
    }

    @Transactional(readOnly = true)
    public Optional<UUID> linkedCollaboratorId(String username) {
        return repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .filter(PortalUser::isActive)
                .map(PortalUser::getConsultantId);
    }

    @Transactional(readOnly = true)
    public Optional<UUID> linkedConsultantId(String username) {
        return repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .filter(PortalUser::isActive)
                .filter(user -> user.getRole() == PortalRole.CONSULTANT)
                .map(PortalUser::getConsultantId);
    }

    @Transactional(readOnly = true)
    public Optional<UUID> linkedAnalystId(String username) {
        return repository.findByNormalizedUsername(PortalUser.normalizeUsername(username))
                .filter(PortalUser::isActive)
                .filter(user -> user.getRole() == PortalRole.ANALYST)
                .map(PortalUser::getConsultantId);
    }

    @Transactional(readOnly = true)
    public void assertConsultantAccess(String username, PortalRole role, UUID requestedConsultantId) {
        if (role == PortalRole.ADMIN) return;
        if (role != PortalRole.CONSULTANT) {
            throw new IllegalArgumentException("Este usuário não possui acesso ao painel de consultor.");
        }
        Optional<UUID> linked = linkedConsultantId(username);
        if (linked.isPresent() && !linked.get().equals(requestedConsultantId)) {
            throw new IllegalArgumentException("Este login está vinculado a outro consultor.");
        }
    }

    @Transactional(readOnly = true)
    public void assertInspectionAccess(String username, PortalRole role, UUID inspectionId) {
        if (role == PortalRole.ADMIN) return;
        Optional<UUID> linked = linkedConsultantId(username);
        if (linked.isEmpty()) return; // usuário consultor padrão mantém o comportamento legado
        var inspection = inspectionRepository.findById(inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Vistoria não encontrada."));
        UUID ownerId = inspection.getConsultant() == null ? null : inspection.getConsultant().getId();
        if (!linked.get().equals(ownerId)) {
            throw new IllegalArgumentException("Esta vistoria pertence a outro consultor.");
        }
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

        UUID consultantId = resolveConsultantForNewUser(
                request.role(), request.consultantId(), request.newConsultantName(), adminUsername
        );
        String displayName = normalizeDisplayName(request.displayName(), request.username(), consultantId);

        PortalUser user = PortalUser.create(
                request.username(), displayName, encoder.encode(request.password()), request.role(), adminUsername
        );
        user.linkConsultant(consultantId);
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

        UUID nextConsultantId = resolveConsultantForUpdate(user, nextRole, request.consultantId(), request.newConsultantName(), adminUsername);
        String nextUsername = requestedUsername == null || requestedUsername.isBlank() ? user.getUsername() : requestedUsername;
        String displayName = request.displayName();
        if (displayName == null || displayName.isBlank()) {
            displayName = normalizeDisplayName(null, nextUsername, nextConsultantId);
        }

        user.updateProfile(requestedUsername, displayName, request.role());
        user.linkConsultant(nextConsultantId);
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
        // Os três usuários padrão continuam existindo. O consultor padrão permanece
        // sem vínculo específico para preservar a seleção manual legada do portal.
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

    private UUID resolveConsultantForNewUser(
            PortalRole role,
            UUID collaboratorId,
            String newCollaboratorName,
            String adminUsername
    ) {
        if (role != PortalRole.CONSULTANT && role != PortalRole.ANALYST) return null;
        UUID resolved = resolveCollaborator(role, collaboratorId, newCollaboratorName, adminUsername);
        if (resolved == null) {
            throw new IllegalArgumentException("Selecione um colaborador existente ou informe o nome do novo colaborador.");
        }
        ensureCollaboratorAvailable(resolved, null);
        return resolved;
    }

    private UUID resolveConsultantForUpdate(
            PortalUser user,
            PortalRole nextRole,
            UUID collaboratorId,
            String newCollaboratorName,
            String adminUsername
    ) {
        if (nextRole != PortalRole.CONSULTANT && nextRole != PortalRole.ANALYST) return null;

        UUID resolved = resolveCollaborator(nextRole, collaboratorId, newCollaboratorName, adminUsername);
        if (resolved == null) {
            // Os usuários padrão criados no bootstrap podem continuar sem vínculo específico.
            if (user.getRole() == nextRole
                    && user.getConsultantId() == null
                    && "BOOTSTRAP".equalsIgnoreCase(user.getCreatedBy())) {
                return null;
            }
            if (user.getRole() == nextRole) resolved = user.getConsultantId();
        }
        if (resolved == null) {
            throw new IllegalArgumentException("Selecione um colaborador existente ou informe o nome do novo colaborador.");
        }
        ensureCollaboratorAvailable(resolved, user.getId());
        return resolved;
    }

    private UUID resolveCollaborator(
            PortalRole role,
            UUID collaboratorId,
            String newCollaboratorName,
            String adminUsername
    ) {
        CollaboratorRole collaboratorRole = role == PortalRole.ANALYST
                ? CollaboratorRole.ANALYST
                : CollaboratorRole.CONSULTANT;
        if (newCollaboratorName != null && !newCollaboratorName.isBlank()) {
            return consultantService.create(
                    newCollaboratorName, collaboratorRole, "CREATED_WITH_PORTAL_USER", adminUsername
            ).id();
        }
        if (collaboratorId != null) {
            return consultantService.findActiveWithRole(collaboratorId, collaboratorRole).getId();
        }
        return null;
    }

    private void ensureCollaboratorAvailable(UUID collaboratorId, UUID currentUserId) {
        repository.findByConsultantId(collaboratorId).ifPresent(existing -> {
            if (currentUserId == null || !existing.getId().equals(currentUserId)) {
                throw new IllegalArgumentException("Este colaborador já possui um usuário específico vinculado.");
            }
        });
    }

    private String normalizeDisplayName(String displayName, String username, UUID consultantId) {
        if (consultantId != null) {
            return consultantName(consultantId);
        }
        if (displayName != null && !displayName.isBlank()) return displayName.trim();
        return username == null ? null : username.trim();
    }

    private String consultantName(UUID consultantId) {
        if (consultantId == null) return null;
        return consultantRepository.findById(consultantId).map(Consultant::getName).orElse(null);
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
                user.getCreatedAt(), user.getUpdatedAt(), user.getPasswordChangedAt(), user.getLastLoginAt(), user.getCreatedBy(),
                user.getConsultantId(), consultantName(user.getConsultantId())
        );
    }

    private String summary(PortalUser user) {
        return "usuario=" + user.getUsername()
                + "; perfil=" + user.getRole()
                + "; ativo=" + user.isActive()
                + "; colaborador=" + (consultantName(user.getConsultantId()) == null ? "sem vínculo específico" : consultantName(user.getConsultantId()));
    }

    public record AuthenticatedPortalUser(
            String username,
            PortalRole role,
            UUID consultantId,
            String consultantName
    ) {}

    public record PortalUserSession(
            String username,
            String displayName,
            PortalRole role,
            UUID consultantId,
            String consultantName
    ) {}
}
