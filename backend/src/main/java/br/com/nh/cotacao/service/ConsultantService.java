package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.PortalDtos.ConsultantResponse;
import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.entity.CollaboratorRole;
import br.com.nh.cotacao.entity.Consultant;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.ConsultantRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.PortalUserRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ConsultantService {
    private final ConsultantRepository repository;
    private final QuotationRepository quotationRepository;
    private final InspectionRequestRepository inspectionRepository;
    private final CatalogChangeAuditRepository auditRepository;
    private final PortalUserRepository portalUserRepository;

    public ConsultantService(
            ConsultantRepository repository,
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository,
            CatalogChangeAuditRepository auditRepository,
            PortalUserRepository portalUserRepository
    ) {
        this.repository = repository;
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
        this.auditRepository = auditRepository;
        this.portalUserRepository = portalUserRepository;
    }

    /** Lista usada nas cotações e no portal: somente consultores ativos. */
    @Transactional(readOnly = true)
    public List<ConsultantResponse> active() {
        return repository.findByActiveTrueAndRoleOrderByNameAsc(CollaboratorRole.CONSULTANT)
                .stream().map(this::toResponse).toList();
    }

    /** Lista de analistas ativos usada pela tela de Análise NH. */
    @Transactional(readOnly = true)
    public List<ConsultantResponse> activeAnalysts() {
        return repository.findByActiveTrueAndRoleOrderByNameAsc(CollaboratorRole.ANALYST)
                .stream().map(this::toResponse).toList();
    }

    /** Painel administrativo: todos os colaboradores, independentemente do cargo. */
    @Transactional(readOnly = true)
    public List<ConsultantResponse> all() {
        return repository.findAllByOrderByNameAsc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ConsultantResponse active(UUID id) {
        return toResponse(findActiveConsultant(id));
    }

    @Transactional
    public ConsultantResponse registerPortalLogin(UUID id) {
        Consultant consultant = findActiveConsultant(id);
        consultant.registerPortalLogin();
        return toResponse(repository.save(consultant));
    }

    @Transactional(readOnly = true)
    public Optional<Consultant> findMostRecentPortalConsultant() {
        return repository.findFirstByActiveTrueAndRoleAndLastPortalLoginAtIsNotNullOrderByLastPortalLoginAtDesc(
                CollaboratorRole.CONSULTANT
        );
    }

    /** Compatibilidade com chamadas antigas: cria consultor. */
    @Transactional
    public ConsultantResponse create(String name, String source) {
        return create(name, CollaboratorRole.CONSULTANT, source, source);
    }

    /** Compatibilidade com chamadas antigas: cria consultor. */
    @Transactional
    public ConsultantResponse create(String name, String source, String username) {
        return create(name, CollaboratorRole.CONSULTANT, source, username);
    }

    @Transactional
    public ConsultantResponse create(String name, CollaboratorRole role, String source, String username) {
        CollaboratorRole requestedRole = role == null ? CollaboratorRole.CONSULTANT : role;
        String normalized = Consultant.normalize(name);
        Consultant collaborator = repository.findByNormalizedName(normalized)
                .map(existing -> {
                    if (existing.getRole() != requestedRole) {
                        throw new IllegalArgumentException(
                                "Já existe um colaborador com esse nome cadastrado como " + roleLabel(existing.getRole()) + "."
                        );
                    }
                    if (!existing.isActive()) existing.setActive(true);
                    return existing;
                })
                .orElseGet(() -> Consultant.create(name, source, requestedRole));
        Consultant saved = repository.save(collaborator);
        auditRepository.save(CatalogChangeAudit.createText(
                "COLLABORATOR", null, saved.getId().toString(),
                "Colaborador cadastrado/reativado — " + saved.getName(),
                null, collaboratorSummary(saved), username
        ));
        return toResponse(saved);
    }

    @Transactional
    public void delete(UUID id, String username) {
        Consultant collaborator = findActiveOrInactive(id);
        portalUserRepository.findByConsultantId(id).ifPresent(user -> {
            throw new IllegalArgumentException(
                    "Este colaborador possui o usuário " + user.getUsername()
                            + " vinculado. Altere ou exclua a conta na aba Usuários antes de remover o colaborador."
            );
        });
        String old = collaboratorSummary(collaborator)
                + "; cotações=" + quotationRepository.countByConsultantId(id)
                + "; vistorias=" + inspectionRepository.countByConsultantId(id);
        String name = collaborator.getName();
        repository.delete(collaborator);
        auditRepository.save(CatalogChangeAudit.createText(
                "COLLABORATOR", null, id.toString(), "Colaborador excluído — " + name,
                old, "Cadastro removido; atividades históricas mantidas com o nome original.", username
        ));
    }

    @Transactional
    public ConsultantResponse update(
            UUID id,
            String name,
            Boolean active,
            CollaboratorRole role,
            String username
    ) {
        Consultant collaborator = findActiveOrInactive(id);
        String old = collaboratorSummary(collaborator);

        if (name != null && !name.isBlank() && !Consultant.normalize(name).equals(collaborator.getNormalizedName())) {
            repository.findByNormalizedName(Consultant.normalize(name)).ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw new IllegalArgumentException("Já existe um colaborador com esse nome.");
                }
            });
            collaborator.rename(name);
        }

        if (role != null && role != collaborator.getRole()) {
            portalUserRepository.findByConsultantId(id).ifPresent(user -> {
                if ((role == CollaboratorRole.CONSULTANT && user.getRole() != br.com.nh.cotacao.security.PortalRole.CONSULTANT)
                        || (role == CollaboratorRole.ANALYST && user.getRole() != br.com.nh.cotacao.security.PortalRole.ANALYST)) {
                    throw new IllegalArgumentException(
                            "Este colaborador possui um usuário vinculado com outro tipo. Ajuste primeiro o tipo do usuário na aba Usuários."
                    );
                }
            });
            collaborator.setRole(role);
        }
        if (active != null) collaborator.setActive(active);

        Consultant saved = repository.save(collaborator);
        auditRepository.save(CatalogChangeAudit.createText(
                "COLLABORATOR", null, id.toString(), "Colaborador alterado — " + saved.getName(),
                old, collaboratorSummary(saved), username
        ));
        return toResponse(saved);
    }

    /** Compatibilidade com código que ainda atualiza apenas nome/ativo. */
    @Transactional
    public ConsultantResponse update(UUID id, String name, Boolean active, String username) {
        return update(id, name, active, null, username);
    }

    @Transactional(readOnly = true)
    public Consultant findActive(UUID id) {
        return findActiveConsultant(id);
    }

    @Transactional(readOnly = true)
    public Consultant findActiveConsultant(UUID id) {
        return findActiveWithRole(id, CollaboratorRole.CONSULTANT);
    }

    @Transactional(readOnly = true)
    public Consultant findActiveAnalyst(UUID id) {
        return findActiveWithRole(id, CollaboratorRole.ANALYST);
    }

    @Transactional(readOnly = true)
    public Consultant findActiveWithRole(UUID id, CollaboratorRole role) {
        Consultant collaborator = findActiveOrInactive(id);
        if (!collaborator.isActive()) {
            throw new IllegalArgumentException("O colaborador selecionado está inativo.");
        }
        if (collaborator.getRole() != role) {
            throw new IllegalArgumentException("O colaborador selecionado não possui o cargo " + roleLabel(role) + ".");
        }
        return collaborator;
    }

    private Consultant findActiveOrInactive(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Colaborador não encontrado."));
    }

    private ConsultantResponse toResponse(Consultant collaborator) {
        return new ConsultantResponse(
                collaborator.getId(), collaborator.getName(), collaborator.isActive(), collaborator.getRole(), collaborator.getSource(),
                collaborator.getCreatedAt(), collaborator.getLastPortalLoginAt(),
                quotationRepository.countByConsultantId(collaborator.getId()),
                inspectionRepository.countByConsultantId(collaborator.getId())
        );
    }

    private String collaboratorSummary(Consultant collaborator) {
        return "nome=" + collaborator.getName()
                + "; cargo=" + collaborator.getRole()
                + "; ativo=" + collaborator.isActive()
                + "; origem=" + collaborator.getSource();
    }

    private String roleLabel(CollaboratorRole role) {
        return role == CollaboratorRole.ANALYST ? "Analista" : "Consultor";
    }
}
