package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.AdminDtos.*;
import br.com.nh.cotacao.entity.*;
import br.com.nh.cotacao.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

@Service
public class AdminCatalogService {
    private final PriceRangeRepository priceRepository;
    private final PlanCoverageRepository planCoverageRepository;
    private final PlanRepository planRepository;
    private final CoverageRepository coverageRepository;
    private final CatalogChangeAuditRepository auditRepository;

    public AdminCatalogService(
            PriceRangeRepository priceRepository,
            PlanCoverageRepository planCoverageRepository,
            PlanRepository planRepository,
            CoverageRepository coverageRepository,
            CatalogChangeAuditRepository auditRepository
    ) {
        this.priceRepository = priceRepository;
        this.planCoverageRepository = planCoverageRepository;
        this.planRepository = planRepository;
        this.coverageRepository = coverageRepository;
        this.auditRepository = auditRepository;
    }

    @Transactional(readOnly = true)
    public List<PriceRangeResponse> priceRanges() {
        return priceRepository.findAllForAdmin().stream().map(item -> new PriceRangeResponse(
                item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getPlan().getCategory().getName(),
                item.getPlan().getRegion().name(), item.getMinValue(), item.getMaxValue(), item.getMonthlyPrice()
        )).toList();
    }

    @Transactional(readOnly = true)
    public List<PlanAdminResponse> plans() {
        return planRepository.findAllForAdmin().stream().map(this::toPlanResponse).toList();
    }

    @Transactional
    public PlanAdminResponse updatePlan(Long id, UpdatePlanRequest request, String username) {
        Plan plan = planRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Plano não encontrado."));
        String old = planSummary(plan);
        plan.updateAdmin(request.name(), request.subtitle(), request.active());
        planRepository.save(plan);
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN", plan.getId(), "Plano " + plan.getCode(), old, planSummary(plan), username
        ));
        return toPlanResponse(plan);
    }

    @Transactional(readOnly = true)
    public List<CoverageAdminResponse> coverages() {
        return planCoverageRepository.findAllForAdmin().stream().map(this::toCoverageResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<OptionalPriceResponse> optionals() {
        return planCoverageRepository.findForAdmin(CoverageStatus.OPTIONAL).stream().map(item -> new OptionalPriceResponse(
                item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getCoverage().getCode(),
                item.getCoverage().getName(), item.getDetail(), item.getMonthlyPrice()
        )).toList();
    }

    @Transactional
    public PriceRangeResponse updatePriceRange(Long id, BigDecimal value, String username) {
        var item = priceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Faixa de preço não encontrada."));
        BigDecimal old = item.getMonthlyPrice();
        item.updateMonthlyPrice(value);
        priceRepository.save(item);
        auditRepository.save(CatalogChangeAudit.create(
                "PRICE_RANGE", id,
                item.getPlan().getName() + " — " + item.getMinValue() + " a " + item.getMaxValue(),
                old, value, username
        ));
        return new PriceRangeResponse(
                item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getPlan().getCategory().getName(),
                item.getPlan().getRegion().name(), item.getMinValue(), item.getMaxValue(), item.getMonthlyPrice()
        );
    }

    @Transactional
    public OptionalPriceResponse updateOptional(Long id, BigDecimal value, String username) {
        var item = planCoverageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Opcional não encontrado."));
        BigDecimal old = item.getMonthlyPrice();
        item.updateMonthlyPrice(value);
        planCoverageRepository.save(item);
        auditRepository.save(CatalogChangeAudit.create(
                "OPTIONAL", id, item.getPlan().getName() + " — " + item.getCoverage().getName(), old, value, username
        ));
        return new OptionalPriceResponse(
                item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getCoverage().getCode(),
                item.getCoverage().getName(), item.getDetail(), item.getMonthlyPrice()
        );
    }

    @Transactional
    public CoverageAdminResponse createCoverage(Long planId, CreateCoverageRequest request, String username) {
        Plan plan = planRepository.findById(planId)
                .orElseThrow(() -> new IllegalArgumentException("Plano não encontrado."));

        String code = request.coverageCode() == null || request.coverageCode().isBlank()
                ? uniqueCoverageCode(plan.getCode(), request.coverageName())
                : normalizeCode(request.coverageCode());

        Coverage coverage = coverageRepository.findByCode(code)
                .orElseGet(() -> coverageRepository.save(Coverage.create(code, request.coverageName())));

        if (planCoverageRepository.existsByPlan_IdAndCoverage_Id(planId, coverage.getId())) {
            throw new IllegalArgumentException("Essa cobertura já está cadastrada neste plano.");
        }

        PlanCoverage item = PlanCoverage.create(
                plan, coverage, request.status(), request.detail(), request.monthlyPrice(), request.sortOrder()
        );
        item = planCoverageRepository.save(item);
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN_COVERAGE", item.getId(), plan.getName() + " — nova cobertura",
                null, coverageSummary(item), username
        ));
        return toCoverageResponse(item);
    }

    @Transactional
    public CoverageAdminResponse updateCoverage(Long id, UpdateCoverageRequest request, String username) {
        PlanCoverage item = planCoverageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cobertura do plano não encontrada."));
        String old = coverageSummary(item);
        item.getCoverage().rename(request.coverageName());
        coverageRepository.save(item.getCoverage());
        item.update(request.status(), request.detail(), request.monthlyPrice(), request.sortOrder());
        planCoverageRepository.save(item);
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN_COVERAGE", item.getId(), item.getPlan().getName() + " — " + item.getCoverage().getName(),
                old, coverageSummary(item), username
        ));
        return toCoverageResponse(item);
    }

    @Transactional
    public void deleteCoverage(Long id, String username) {
        PlanCoverage item = planCoverageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cobertura do plano não encontrada."));
        String description = item.getPlan().getName() + " — " + item.getCoverage().getName();
        String old = coverageSummary(item);
        planCoverageRepository.delete(item);
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN_COVERAGE", id, description + " removida", old, null, username
        ));
    }

    @Transactional(readOnly = true)
    public List<AuditResponse> audit() {
        return auditRepository.findTop100ByOrderByChangedAtDesc().stream().map(item -> new AuditResponse(
                item.getId(), item.getItemType(), item.getItemId(), item.getDescription(),
                item.getOldValue(), item.getNewValue(), item.getOldText(), item.getNewText(),
                item.getChangedBy(), item.getChangedAt()
        )).toList();
    }

    private PlanAdminResponse toPlanResponse(Plan plan) {
        return new PlanAdminResponse(
                plan.getId(), plan.getCode(), plan.getName(), plan.getSubtitle(),
                plan.getCategory().getName(), plan.getRegion().name(), Boolean.TRUE.equals(plan.getActive())
        );
    }

    private CoverageAdminResponse toCoverageResponse(PlanCoverage item) {
        return new CoverageAdminResponse(
                item.getId(), item.getPlan().getId(), item.getPlan().getCode(), item.getPlan().getName(),
                item.getPlan().getCategory().getName(), item.getPlan().getRegion().name(),
                item.getCoverage().getId(), item.getCoverage().getCode(), item.getCoverage().getName(),
                item.getStatus(), item.getDetail(), item.getMonthlyPrice(), item.getSortOrder()
        );
    }

    private String planSummary(Plan plan) {
        return "nome=" + plan.getName() + "; subtítulo=" + value(plan.getSubtitle()) + "; ativo=" + plan.getActive();
    }

    private String coverageSummary(PlanCoverage item) {
        return "nome=" + item.getCoverage().getName()
                + "; status=" + item.getStatus()
                + "; detalhe=" + value(item.getDetail())
                + "; mensal=" + value(item.getMonthlyPrice())
                + "; ordem=" + item.getSortOrder();
    }

    private String value(Object value) {
        return value == null ? "—" : value.toString();
    }

    private String uniqueCoverageCode(String planCode, String coverageName) {
        String base = normalizeCode(planCode + "_" + coverageName);
        String candidate = base;
        int suffix = 2;
        while (coverageRepository.existsByCode(candidate)) {
            String ending = "_" + suffix++;
            candidate = base.substring(0, Math.min(base.length(), 80 - ending.length())) + ending;
        }
        return candidate;
    }

    private String normalizeCode(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Código da cobertura inválido.");
        }
        return normalized.length() <= 80 ? normalized : normalized.substring(0, 80);
    }
}
