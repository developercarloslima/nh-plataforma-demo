package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.PortalDtos.ConsultantResponse;
import br.com.nh.cotacao.entity.Consultant;
import br.com.nh.cotacao.repository.ConsultantRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ConsultantService {
    private final ConsultantRepository repository;
    private final QuotationRepository quotationRepository;
    private final InspectionRequestRepository inspectionRepository;

    public ConsultantService(
            ConsultantRepository repository,
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository
    ) {
        this.repository = repository;
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
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
    public ConsultantResponse create(String name, String source) {
        String normalized = Consultant.normalize(name);
        Consultant consultant = repository.findByNormalizedName(normalized)
                .map(existing -> {
                    if (!existing.isActive()) existing.setActive(true);
                    return existing;
                })
                .orElseGet(() -> Consultant.create(name, source));
        return toResponse(repository.save(consultant));
    }

    @Transactional
    public void delete(UUID id) {
        Consultant consultant = findActiveOrInactive(id);
        long quoteCount = quotationRepository.countByConsultantId(id);
        long inspectionCount = inspectionRepository.countByConsultantId(id);
        if (quoteCount > 0 || inspectionCount > 0) {
            throw new IllegalArgumentException(
                    "Este consultor possui atividades registradas. Desative-o para preservar o histórico."
            );
        }
        repository.delete(consultant);
    }

    @Transactional
    public ConsultantResponse update(UUID id, String name, Boolean active) {
        Consultant consultant = findActiveOrInactive(id);
        if (name != null && !name.isBlank() && !Consultant.normalize(name).equals(consultant.getNormalizedName())) {
            repository.findByNormalizedName(Consultant.normalize(name)).ifPresent(existing -> {
                if (!existing.getId().equals(id)) throw new IllegalArgumentException("Já existe um consultor com esse nome.");
            });
            consultant.rename(name);
        }
        if (active != null) consultant.setActive(active);
        return toResponse(repository.save(consultant));
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
                consultant.getId(),
                consultant.getName(),
                consultant.isActive(),
                consultant.getSource(),
                consultant.getCreatedAt(),
                quotationRepository.countByConsultantId(consultant.getId()),
                inspectionRepository.countByConsultantId(consultant.getId())
        );
    }
}
