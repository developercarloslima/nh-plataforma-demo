package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.PortalDtos.ConsultantResponse;
import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.entity.Consultant;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.ConsultantRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
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

    public ConsultantService(
            ConsultantRepository repository,
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository,
            CatalogChangeAuditRepository auditRepository
    ) {
        this.repository = repository;
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
        this.auditRepository = auditRepository;
    }

    @Transactional(readOnly = true)
    public List<ConsultantResponse> active() {
        return repository.findByActiveTrueOrderByNameAsc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ConsultantResponse> all() {
        return repository.findAllByOrderByNameAsc().stream().map(this::toResponse).toList();
    }


    @Transactional
    public ConsultantResponse registerPortalLogin(UUID id) {
        Consultant consultant = findActive(id);
        consultant.registerPortalLogin();
        return toResponse(repository.save(consultant));
    }

    @Transactional(readOnly = true)
    public Optional<Consultant> findMostRecentPortalConsultant() {
        return repository.findFirstByActiveTrueAndLastPortalLoginAtIsNotNullOrderByLastPortalLoginAtDesc();
    }

    @Transactional
    public ConsultantResponse create(String name, String source) {
        return create(name, source, source);
    }

    @Transactional
    public ConsultantResponse create(String name, String source, String username) {
        String normalized = Consultant.normalize(name);
        Consultant consultant = repository.findByNormalizedName(normalized)
                .map(existing -> {
                    if (!existing.isActive()) existing.setActive(true);
                    return existing;
                })
                .orElseGet(() -> Consultant.create(name, source));
        Consultant saved = repository.save(consultant);
        auditRepository.save(CatalogChangeAudit.createText(
                "CONSULTANT", null, saved.getId().toString(), "Consultor cadastrado/reativado — " + saved.getName(),
                null, consultantSummary(saved), username
        ));
        return toResponse(saved);
    }

    @Transactional
    public void delete(UUID id, String username) {
        Consultant consultant = findActiveOrInactive(id);
        String old = consultantSummary(consultant)
                + "; cotações=" + quotationRepository.countByConsultantId(id)
                + "; vistorias=" + inspectionRepository.countByConsultantId(id);
        String name = consultant.getName();
        repository.delete(consultant);
        auditRepository.save(CatalogChangeAudit.createText(
                "CONSULTANT", null, id.toString(), "Consultor excluído — " + name,
                old, "Cadastro removido; atividades mantidas com o nome original.", username
        ));
    }

    @Transactional
    public ConsultantResponse update(UUID id, String name, Boolean active, String username) {
        Consultant consultant = findActiveOrInactive(id);
        String old = consultantSummary(consultant);
        if (name != null && !name.isBlank() && !Consultant.normalize(name).equals(consultant.getNormalizedName())) {
            repository.findByNormalizedName(Consultant.normalize(name)).ifPresent(existing -> {
                if (!existing.getId().equals(id)) throw new IllegalArgumentException("Já existe um consultor com esse nome.");
            });
            consultant.rename(name);
        }
        if (active != null) consultant.setActive(active);
        Consultant saved = repository.save(consultant);
        auditRepository.save(CatalogChangeAudit.createText(
                "CONSULTANT", null, id.toString(), "Consultor alterado — " + saved.getName(),
                old, consultantSummary(saved), username
        ));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public Consultant findActive(UUID id) {
        Consultant consultant = findActiveOrInactive(id);
        if (!consultant.isActive()) throw new IllegalArgumentException("O consultor selecionado está inativo.");
        return consultant;
    }

    private Consultant findActiveOrInactive(UUID id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Consultor não encontrado."));
    }

    private ConsultantResponse toResponse(Consultant consultant) {
        return new ConsultantResponse(
                consultant.getId(), consultant.getName(), consultant.isActive(), consultant.getSource(),
                consultant.getCreatedAt(), consultant.getLastPortalLoginAt(),
                quotationRepository.countByConsultantId(consultant.getId()),
                inspectionRepository.countByConsultantId(consultant.getId())
        );
    }

    private String consultantSummary(Consultant consultant) {
        return "nome=" + consultant.getName() + "; ativo=" + consultant.isActive() + "; origem=" + consultant.getSource();
    }
}
