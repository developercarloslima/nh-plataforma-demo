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
        String code = requestedPlanCode(request.code(), category.getCode(), request.region(), request.name(), null);
        Plan plan = planRepository.save(Plan.create(
                code, request.name(), request.subtitle(), category, request.region(), request.displayOrder(), request.active(),
                request.extraAbove(), request.extraStep(), request.extraIncrement(), request.extraBasePrice(),
                request.trackerRequiredAbove(), request.trackerInstallationFee(), request.trackerMonthlyFee()
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
        String code = requestedPlanCode(request.code(), category.getCode(), request.region(), request.name(), id);
        String old = planSummary(plan);
        plan.updateAdmin(
                code, request.name(), request.subtitle(), category, request.region(), request.displayOrder(), request.active(),
                request.extraAbove(), request.extraStep(), request.extraIncrement(), request.extraBasePrice(),
                request.trackerRequiredAbove(), request.trackerInstallationFee(), request.trackerMonthlyFee()
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
        String code = requestedCoverageCode(request.coverageCode(), plan.getCode(), request.coverageName(), null);
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
        Plan targetPlan = findPlan(request.planId());
        String old = coverageSummary(item);
        Coverage current = item.getCoverage();
        String requestedName = request.coverageName().trim();
        String requestedCode = normalizeCode(request.coverageCode(), 80, "Código da cobertura inválido.");
        boolean metadataChanged = !current.getName().equals(requestedName) || !current.getCode().equals(requestedCode);
        Coverage selectedCoverage = current;

        if (metadataChanged && planCoverageRepository.countByCoverage_Id(current.getId()) > 1) {
            String clonedCode = requestedCode.equals(current.getCode())
                    ? uniqueCoverageCode(targetPlan.getCode(), requestedName)
                    : requestedCoverageCode(requestedCode, targetPlan.getCode(), requestedName, null);
            selectedCoverage = coverageRepository.save(Coverage.create(clonedCode, requestedName));
        } else if (metadataChanged) {
            requestedCoverageCode(requestedCode, targetPlan.getCode(), requestedName, current.getId());
            current.updateAdmin(requestedCode, requestedName);
            selectedCoverage = coverageRepository.save(current);
        }

        if ((!item.getPlan().getId().equals(targetPlan.getId()) || !item.getCoverage().getId().equals(selectedCoverage.getId()))
                && planCoverageRepository.existsByPlan_IdAndCoverage_Id(targetPlan.getId(), selectedCoverage.getId())) {
            throw new IllegalArgumentException("Este plano já possui essa cobertura.");
        }

        item.replacePlan(targetPlan);
        item.replaceCoverage(selectedCoverage);
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
                plan.getId(), plan.getCode(), plan.getName(), plan.getSubtitle(), plan.getCategory().getId(),
                plan.getCategory().getName(), plan.getCategory().getCode(), plan.getRegion(),
                plan.getDisplayOrder(), Boolean.TRUE.equals(plan.getActive()),
                plan.getExtraAbove(), plan.getExtraStep(), plan.getExtraIncrement(), plan.getExtraBasePrice(),
                plan.getTrackerRequiredAbove(), plan.getTrackerInstallationFee(), plan.getTrackerMonthlyFee()
        );
    }

    private CoverageAdminResponse toCoverageResponse(PlanCoverage item) {
        return new CoverageAdminResponse(
                item.getId(), item.getPlan().getId(), item.getPlan().getName(),
                item.getPlan().getCategory().getName(), item.getPlan().getRegion().name(),
                item.getCoverage().getId(), item.getCoverage().getCode(), item.getCoverage().getName(), item.getStatus(),
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
        return "código=" + plan.getCode()
                + "; nome=" + plan.getName()
                + "; categoria=" + plan.getCategory().getName()
                + "; região=" + plan.getRegion()
                + "; subtítulo=" + value(plan.getSubtitle())
                + "; ordem=" + plan.getDisplayOrder()
                + "; ativo=" + plan.getActive()
                + "; extraAcima=" + value(plan.getExtraAbove())
                + "; extraIntervalo=" + value(plan.getExtraStep())
                + "; extraAcréscimo=" + value(plan.getExtraIncrement())
                + "; extraBase=" + value(plan.getExtraBasePrice())
                + "; rastreadorAcima=" + value(plan.getTrackerRequiredAbove())
                + "; rastreadorInstalação=" + value(plan.getTrackerInstallationFee())
                + "; rastreadorMensal=" + value(plan.getTrackerMonthlyFee());
    }

    private String coverageSummary(PlanCoverage item) {
        return "plano=" + item.getPlan().getName()
                + "; código=" + item.getCoverage().getCode()
                + "; nome=" + item.getCoverage().getName()
                + "; status=" + item.getStatus()
                + "; detalhe=" + value(item.getDetail())
                + "; mensal=" + value(item.getMonthlyPrice())
                + "; ordem=" + item.getSortOrder();
    }

    private String value(Object value) { return value == null ? "—" : value.toString(); }

    private String requestedPlanCode(String requested, String categoryCode, Region region, String name, Long ignoredId) {
        if (requested == null || requested.isBlank()) {
            return uniquePlanCode(categoryCode, region, name);
        }
        String code = normalizeCode(requested, 80, "Código do plano inválido.");
        boolean exists = ignoredId == null ? planRepository.existsByCode(code) : planRepository.existsByCodeAndIdNot(code, ignoredId);
        if (exists) throw new IllegalArgumentException("Já existe um plano com esse código interno.");
        return code;
    }

    private String requestedCoverageCode(String requested, String planCode, String coverageName, Long ignoredId) {
        if (requested == null || requested.isBlank()) {
            return uniqueCoverageCode(planCode, coverageName);
        }
        String code = normalizeCode(requested, 80, "Código da cobertura inválido.");
        boolean exists = ignoredId == null ? coverageRepository.existsByCode(code) : coverageRepository.existsByCodeAndIdNot(code, ignoredId);
        if (exists) throw new IllegalArgumentException("Já existe uma cobertura com esse código interno.");
        return code;
    }

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
