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
    private final VehicleCategoryRepository categoryRepository;
    private final CatalogChangeAuditRepository auditRepository;

    public AdminCatalogService(
            PriceRangeRepository priceRepository,
            PlanCoverageRepository planCoverageRepository,
            PlanRepository planRepository,
            CoverageRepository coverageRepository,
            VehicleCategoryRepository categoryRepository,
            CatalogChangeAuditRepository auditRepository
    ) {
        this.priceRepository = priceRepository;
        this.planCoverageRepository = planCoverageRepository;
        this.planRepository = planRepository;
        this.coverageRepository = coverageRepository;
        this.categoryRepository = categoryRepository;
        this.auditRepository = auditRepository;
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> categories() {
        return categoryRepository.findAllByOrderByNameAsc().stream()
                .map(item -> new CategoryResponse(item.getId(), item.getCode(), item.getName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PriceRangeResponse> priceRanges() {
        return priceRepository.findAllForAdmin().stream().map(this::toPriceResponse).toList();
    }

    @Transactional
    public PriceRangeResponse createPriceRange(CreatePriceRangeRequest request, String username) {
        Plan plan = findPlan(request.planId());
        validateRange(plan.getId(), null, request.minValue(), request.maxValue());
        PriceRange range = priceRepository.save(PriceRange.create(
                plan, request.minValue(), request.maxValue(), request.monthlyPrice()
        ));
        auditRepository.save(CatalogChangeAudit.createText(
                "PRICE_RANGE", range.getId(), "Nova faixa — " + plan.getName(),
                null, priceSummary(range), username
        ));
        return toPriceResponse(range);
    }

    @Transactional
    public PriceRangeResponse updatePriceRange(Long id, UpdatePriceRangeRequest request, String username) {
        PriceRange range = priceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Faixa de preço não encontrada."));
        String old = priceSummary(range);
        validateRange(range.getPlan().getId(), id, request.minValue(), request.maxValue());
        range.update(request.minValue(), request.maxValue(), request.monthlyPrice());
        priceRepository.save(range);
        auditRepository.save(CatalogChangeAudit.createText(
                "PRICE_RANGE", id, "Faixa alterada — " + range.getPlan().getName(),
                old, priceSummary(range), username
        ));
        return toPriceResponse(range);
    }

    @Transactional
    public void deletePriceRange(Long id, String username) {
        PriceRange range = priceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Faixa de preço não encontrada."));
        String old = priceSummary(range);
        String description = "Faixa excluída — " + range.getPlan().getName();
        priceRepository.delete(range);
        auditRepository.save(CatalogChangeAudit.createText(
                "PRICE_RANGE", id, description, old, null, username
        ));
    }

    @Transactional(readOnly = true)
    public List<PlanAdminResponse> plans() {
        return planRepository.findAllForAdmin().stream().map(this::toPlanResponse).toList();
    }

    @Transactional
    public PlanAdminResponse createPlan(CreatePlanRequest request, String username) {
        VehicleCategory category = findCategory(request.categoryId());
        String code = uniquePlanCode(category.getCode(), request.region(), request.name());
        Plan plan = planRepository.save(Plan.create(
                code, request.name(), request.subtitle(), category, request.region(), request.displayOrder(), request.active()
        ));
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN", plan.getId(), "Plano criado — " + plan.getName(), null, planSummary(plan), username
        ));
        return toPlanResponse(plan);
    }

    @Transactional
    public PlanAdminResponse updatePlan(Long id, UpdatePlanRequest request, String username) {
        Plan plan = findPlan(id);
        VehicleCategory category = findCategory(request.categoryId());
        String old = planSummary(plan);
        plan.updateAdmin(
                request.name(), request.subtitle(), category, request.region(), request.displayOrder(), request.active()
        );
        planRepository.save(plan);
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN", plan.getId(), "Plano alterado — " + plan.getName(), old, planSummary(plan), username
        ));
        return toPlanResponse(plan);
    }

    @Transactional
    public void deletePlan(Long id, String username) {
        Plan plan = findPlan(id);
        List<Long> coverageIds = planCoverageRepository.findByPlan_Id(id).stream()
                .map(item -> item.getCoverage().getId())
                .distinct()
                .toList();
        int priceCount = priceRepository.findByPlan_Id(id).size();
        int coverageCount = coverageIds.size();
        String old = planSummary(plan)
                + "; faixas=" + priceCount
                + "; coberturas=" + coverageCount;
        String name = plan.getName();
        planRepository.delete(plan);
        planRepository.flush();
        for (Long coverageId : coverageIds) {
            if (planCoverageRepository.countByCoverage_Id(coverageId) == 0) {
                coverageRepository.deleteById(coverageId);
            }
        }
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN", id, "Plano excluído — " + name, old, null, username
        ));
    }

    @Transactional(readOnly = true)
    public List<CoverageAdminResponse> coverages() {
        return planCoverageRepository.findAllForAdmin().stream().map(this::toCoverageResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<OptionalPriceResponse> optionals() {
        return planCoverageRepository.findForAdmin(CoverageStatus.OPTIONAL).stream().map(item -> new OptionalPriceResponse(
                item.getId(), item.getPlan().getId(), item.getPlan().getName(), item.getCoverage().getName(),
                item.getDetail(), item.getMonthlyPrice()
        )).toList();
    }

    @Transactional
    public OptionalPriceResponse updateOptional(Long id, BigDecimal value, String username) {
        PlanCoverage item = planCoverageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Opcional não encontrado."));
        BigDecimal old = item.getMonthlyPrice();
        item.updateMonthlyPrice(value);
        planCoverageRepository.save(item);
        auditRepository.save(CatalogChangeAudit.create(
                "OPTIONAL", id, item.getPlan().getName() + " — " + item.getCoverage().getName(), old, value, username
        ));
        return new OptionalPriceResponse(
                item.getId(), item.getPlan().getId(), item.getPlan().getName(), item.getCoverage().getName(),
                item.getDetail(), item.getMonthlyPrice()
        );
    }

    @Transactional
    public CoverageAdminResponse createCoverage(Long planId, CreateCoverageRequest request, String username) {
        Plan plan = findPlan(planId);
        String code = uniqueCoverageCode(plan.getCode(), request.coverageName());
        Coverage coverage = coverageRepository.save(Coverage.create(code, request.coverageName()));
        PlanCoverage item = planCoverageRepository.save(PlanCoverage.create(
                plan, coverage, request.status(), request.detail(), request.monthlyPrice(), request.sortOrder()
        ));
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN_COVERAGE", item.getId(), plan.getName() + " — cobertura criada",
                null, coverageSummary(item), username
        ));
        return toCoverageResponse(item);
    }

    @Transactional
    public CoverageAdminResponse updateCoverage(Long id, UpdateCoverageRequest request, String username) {
        PlanCoverage item = planCoverageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cobertura do plano não encontrada."));
        String old = coverageSummary(item);
        Coverage current = item.getCoverage();
        if (!current.getName().equals(request.coverageName().trim())) {
            if (planCoverageRepository.countByCoverage_Id(current.getId()) > 1) {
                Coverage replacement = coverageRepository.save(Coverage.create(
                        uniqueCoverageCode(item.getPlan().getCode(), request.coverageName()), request.coverageName()
                ));
                item.replaceCoverage(replacement);
            } else {
                current.rename(request.coverageName());
                coverageRepository.save(current);
            }
        }
        item.update(request.status(), request.detail(), request.monthlyPrice(), request.sortOrder());
        planCoverageRepository.save(item);
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN_COVERAGE", item.getId(), item.getPlan().getName() + " — cobertura alterada",
                old, coverageSummary(item), username
        ));
        return toCoverageResponse(item);
    }

    @Transactional
    public void deleteCoverage(Long id, String username) {
        PlanCoverage item = planCoverageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cobertura do plano não encontrada."));
        Coverage coverage = item.getCoverage();
        String description = item.getPlan().getName() + " — " + coverage.getName();
        String old = coverageSummary(item);
        planCoverageRepository.delete(item);
        planCoverageRepository.flush();
        if (planCoverageRepository.countByCoverage_Id(coverage.getId()) == 0) {
            coverageRepository.delete(coverage);
        }
        auditRepository.save(CatalogChangeAudit.createText(
                "PLAN_COVERAGE", id, description + " excluída", old, null, username
        ));
    }

    @Transactional(readOnly = true)
    public List<AuditResponse> audit() {
        return auditRepository.findAllByOrderByChangedAtDesc().stream().map(item -> new AuditResponse(
                item.getId(), item.getItemType(), item.getItemId(), item.getItemKey(), item.getDescription(),
                item.getOldValue(), item.getNewValue(), item.getOldText(), item.getNewText(),
                item.getChangedBy(), item.getChangedAt()
        )).toList();
    }

    private PriceRangeResponse toPriceResponse(PriceRange item) {
        return new PriceRangeResponse(
                item.getId(), item.getPlan().getId(), item.getPlan().getName(), item.getPlan().getCategory().getName(),
                item.getPlan().getRegion().name(), item.getMinValue(), item.getMaxValue(), item.getMonthlyPrice()
        );
    }

    private PlanAdminResponse toPlanResponse(Plan plan) {
        return new PlanAdminResponse(
                plan.getId(), plan.getName(), plan.getSubtitle(), plan.getCategory().getId(),
                plan.getCategory().getName(), plan.getCategory().getCode(), plan.getRegion(),
                plan.getDisplayOrder(), Boolean.TRUE.equals(plan.getActive())
        );
    }

    private CoverageAdminResponse toCoverageResponse(PlanCoverage item) {
        return new CoverageAdminResponse(
                item.getId(), item.getPlan().getId(), item.getPlan().getName(),
                item.getPlan().getCategory().getName(), item.getPlan().getRegion().name(),
                item.getCoverage().getId(), item.getCoverage().getName(), item.getStatus(),
                item.getDetail(), item.getMonthlyPrice(), item.getSortOrder()
        );
    }

    private void validateRange(Long planId, Long ignoredId, BigDecimal min, BigDecimal max) {
        if (max.compareTo(min) < 0) throw new IllegalArgumentException("O valor FIPE máximo deve ser maior ou igual ao mínimo.");
        boolean overlaps = priceRepository.findByPlan_Id(planId).stream().anyMatch(item ->
                (ignoredId == null || !item.getId().equals(ignoredId))
                        && item.getMinValue().compareTo(max) <= 0
                        && item.getMaxValue().compareTo(min) >= 0
        );
        if (overlaps) throw new IllegalArgumentException("A faixa FIPE informada se sobrepõe a outra faixa deste plano.");
    }

    private Plan findPlan(Long id) {
        return planRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Plano não encontrado."));
    }

    private VehicleCategory findCategory(Long id) {
        return categoryRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Categoria não encontrada."));
    }

    private String priceSummary(PriceRange range) {
        return "plano=" + range.getPlan().getName()
                + "; mínimo=" + range.getMinValue()
                + "; máximo=" + range.getMaxValue()
                + "; mensal=" + range.getMonthlyPrice();
    }

    private String planSummary(Plan plan) {
        return "nome=" + plan.getName()
                + "; categoria=" + plan.getCategory().getName()
                + "; região=" + plan.getRegion()
                + "; subtítulo=" + value(plan.getSubtitle())
                + "; ordem=" + plan.getDisplayOrder()
                + "; ativo=" + plan.getActive();
    }

    private String coverageSummary(PlanCoverage item) {
        return "nome=" + item.getCoverage().getName()
                + "; status=" + item.getStatus()
                + "; detalhe=" + value(item.getDetail())
                + "; mensal=" + value(item.getMonthlyPrice())
                + "; ordem=" + item.getSortOrder();
    }

    private String value(Object value) { return value == null ? "—" : value.toString(); }

    private String uniquePlanCode(String categoryCode, Region region, String name) {
        String base = normalizeCode(categoryCode + "_" + region.name() + "_" + name, 80, "Código do plano inválido.");
        String candidate = base;
        int suffix = 2;
        while (planRepository.existsByCode(candidate)) {
            String ending = "_" + suffix++;
            candidate = base.substring(0, Math.min(base.length(), 80 - ending.length())) + ending;
        }
        return candidate;
    }

    private String uniqueCoverageCode(String planCode, String coverageName) {
        String base = normalizeCode(planCode + "_" + coverageName, 80, "Código da cobertura inválido.");
        String candidate = base;
        int suffix = 2;
        while (coverageRepository.existsByCode(candidate)) {
            String ending = "_" + suffix++;
            candidate = base.substring(0, Math.min(base.length(), 80 - ending.length())) + ending;
        }
        return candidate;
    }

    private String normalizeCode(String value, int maxLength, String error) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (normalized.isBlank()) throw new IllegalArgumentException(error);
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
}
