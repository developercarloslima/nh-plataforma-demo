package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.QuoteDtos.*;
import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.entity.Plan;
import br.com.nh.cotacao.entity.PlanCoverage;
import br.com.nh.cotacao.entity.Quotation;
import br.com.nh.cotacao.entity.QuoteStatus;
import br.com.nh.cotacao.repository.PlanRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Year;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class QuoteService {

    private final PlanRepository planRepository;
    private final QuotationRepository quotationRepository;
    private final PricingService pricingService;
    private final ConsultantService consultantService;
    private final String publicApiUrl;
    private final String teamWhatsappNumber;

    public QuoteService(
            PlanRepository planRepository,
            QuotationRepository quotationRepository,
            PricingService pricingService,
            ConsultantService consultantService,
            @Value("${app.public-api-url:http://localhost:8080}") String publicApiUrl,
            @Value("${app.team-whatsapp-number:}") String teamWhatsappNumber
    ) {
        this.planRepository = planRepository;
        this.quotationRepository = quotationRepository;
        this.pricingService = pricingService;
        this.consultantService = consultantService;
        this.publicApiUrl = stripTrailingSlash(publicApiUrl);
        this.teamWhatsappNumber = normalizePhone(teamWhatsappNumber);
    }

    @Transactional(readOnly = true)
    public OptionsResponse options(OptionsRequest request) {
        List<PlanOption> options = planRepository
                .findByCategory_CodeAndRegionAndActiveTrueOrderByDisplayOrder(request.categoryCode(), request.region())
                .stream()
                .map(plan -> toPlanOption(plan, request.fipeValue()))
                .flatMap(java.util.Optional::stream)
                .toList();

        if (options.isEmpty()) {
            throw new IllegalArgumentException("Nenhum plano possui faixa de preço para os dados informados.");
        }

        return new OptionsResponse(request.categoryCode(), request.region(), request.fipeValue(), options);
    }

    @Transactional
    public QuoteResponse create(CreateQuoteRequest request) {
        validateYear(request.manufactureYear());

        Plan selectedPlan = planRepository.findByCodeAndActiveTrue(request.selectedPlanCode())
                .orElseThrow(() -> new IllegalArgumentException("Plano selecionado não encontrado."));

        if (!selectedPlan.getCategory().getCode().equals(request.categoryCode())
                || selectedPlan.getRegion() != request.region()) {
            throw new IllegalArgumentException("O plano selecionado não pertence à categoria/região informada.");
        }

        PricingService.PricingResult pricing = pricingService.calculateBreakdown(selectedPlan, request.fipeValue())
                .orElseThrow(() -> new IllegalArgumentException("O valor FIPE está fora da tabela do plano selecionado."));

        List<PlanCoverage> selectedOptionals = resolveSelectedOptionals(selectedPlan, request.selectedOptionalCodes());

        var consultant = consultantService.findActive(request.consultantId());

        Quotation quotation = Quotation.create(
                buildQuoteNumber(),
                consultant,
                request.customerName().trim(),
                normalizePhone(request.whatsapp()),
                request.plate().trim(),
                request.model().trim(),
                request.manufactureYear(),
                request.zeroKm(),
                request.fipeValue(),
                request.categoryCode(),
                request.region(),
                selectedPlan.getCode(),
                selectedPlan.getName(),
                pricing.tableMonthlyValue(),
                pricing.mandatoryMonthlyFee(),
                pricing.oneTimeFee(),
                pricing.mandatoryFeeDescription()
        );

        selectedOptionals.forEach(item -> quotation.addOptional(
                item.getCoverage().getCode(),
                item.getCoverage().getName(),
                item.getDetail(),
                item.getMonthlyPrice()
        ));

        return toResponse(quotationRepository.save(quotation));
    }

    @Transactional(readOnly = true)
    public QuoteResponse get(UUID id) {
        return toResponse(find(id));
    }

    @Transactional
    public DecisionResponse decide(UUID id, DecisionRequest request) {
        if (request.decision() != QuoteStatus.ACCEPTED && request.decision() != QuoteStatus.DECLINED) {
            throw new IllegalArgumentException("Use ACCEPTED ou DECLINED para responder à proposta.");
        }

        Quotation quotation = find(id);
        if (quotation.getStatus() == QuoteStatus.CREATED
                && java.time.OffsetDateTime.now().isAfter(quotation.getValidUntil())) {
            throw new IllegalArgumentException("Esta cotação expirou. Gere uma nova proposta.");
        }
        quotation.decide(request.decision());
        quotationRepository.save(quotation);

        return new DecisionResponse(toResponse(quotation), null, null);
    }

    @Transactional(readOnly = true)
    public Quotation find(UUID id) {
        return quotationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
    }

    @Transactional(readOnly = true)
    public Plan findSelectedPlan(Quotation quotation) {
        return planRepository.findByCodeAndActiveTrue(quotation.getSelectedPlanCode())
                .orElseThrow(() -> new IllegalArgumentException("Plano da cotação não encontrado."));
    }

    public String publicPdfUrl(Quotation quotation) {
        return publicApiUrl + "/api/quotes/" + quotation.getId() + "/pdf";
    }

    public QuoteResponse toResponse(Quotation quotation) {
        List<SelectedOptionalResponse> selectedOptionals = quotation.getSelectedOptionals().stream()
                .map(item -> new SelectedOptionalResponse(
                        item.getCoverageCode(),
                        item.getCoverageName(),
                        item.getDetail(),
                        item.getMonthlyPrice()
                ))
                .toList();

        List<InspectionPhotoResponse> inspectionPhotos = quotation.getInspectionPhotos().stream()
                .sorted(Comparator.comparingInt(item -> item.getSortOrder()))
                .map(item -> new InspectionPhotoResponse(
                        item.getId(),
                        item.getLabel(),
                        item.getFileName(),
                        item.getDriveFileUrl(),
                        item.getSortOrder()
                ))
                .toList();

        BigDecimal optionalMonthlyValue = quotation.getSelectedOptionals().stream()
                .map(item -> item.getMonthlyPrice())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String teamWhatsappUrl = buildTeamWhatsappUrl(quotation);
        String clientWhatsappUrl = buildClientWhatsappUrl(quotation);

        return new QuoteResponse(
                quotation.getId(),
                quotation.getQuoteNumber(),
                quotation.getConsultant() == null ? null : quotation.getConsultant().getId(),
                quotation.getConsultantName(),
                quotation.getCustomerName(),
                quotation.getWhatsapp(),
                quotation.getPlate(),
                quotation.getModel(),
                quotation.getManufactureYear(),
                quotation.isZeroKm(),
                quotation.getFipeValue(),
                quotation.getCategoryCode(),
                quotation.getRegion(),
                quotation.getSelectedPlanCode(),
                quotation.getSelectedPlanName(),
                quotation.getBaseMonthlyValue(),
                quotation.getMandatoryMonthlyFee(),
                optionalMonthlyValue,
                quotation.getMonthlyValue(),
                quotation.getOneTimeFee(),
                quotation.getMandatoryFeeDescription(),
                selectedOptionals,
                quotation.getStatus(),
                quotation.getCreatedAt(),
                quotation.getValidUntil(),
                quotation.getStatus() == QuoteStatus.CREATED && java.time.OffsetDateTime.now().isAfter(quotation.getValidUntil()),
                quotation.getDecidedAt(),
                quotation.getDriveFolderUrl(),
                quotation.getDrivePdfUrl(),
                quotation.getInspectionCompletedAt(),
                inspectionPhotos,
                teamWhatsappUrl,
                clientWhatsappUrl
        );
    }

    @Transactional(readOnly = true)
    public List<QuoteResponse> adminList() {
        return quotationRepository.findTop300ByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    private List<PlanCoverage> resolveSelectedOptionals(Plan plan, List<String> requestedCodes) {
        Set<String> uniqueCodes = new LinkedHashSet<>(requestedCodes);
        if (uniqueCodes.size() != requestedCodes.size()) {
            throw new IllegalArgumentException("O mesmo opcional não pode ser selecionado mais de uma vez.");
        }
        if (uniqueCodes.contains("FUNERAL") && uniqueCodes.contains("FUNERAL_FAMILY")) {
            throw new IllegalArgumentException("Escolha apenas uma modalidade de auxílio funeral.");
        }

        List<PlanCoverage> optionals = plan.getCoverages().stream()
                .filter(item -> item.getStatus() == CoverageStatus.OPTIONAL)
                .toList();

        List<PlanCoverage> selected = uniqueCodes.stream()
                .map(code -> optionals.stream()
                        .filter(item -> item.getCoverage().getCode().equals(code))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException(
                                "O opcional " + code + " não está disponível para o plano selecionado."
                        )))
                .toList();

        selected.forEach(item -> {
            if (item.getMonthlyPrice() == null) {
                throw new IllegalArgumentException(
                        "O opcional " + item.getCoverage().getName() + " ainda não possui valor cadastrado."
                );
            }
        });
        return selected;
    }

    private java.util.Optional<PlanOption> toPlanOption(Plan plan, BigDecimal fipeValue) {
        return pricingService.calculateBreakdown(plan, fipeValue).map(pricing -> new PlanOption(
                plan.getCode(),
                plan.getName(),
                plan.getSubtitle(),
                pricing.tableMonthlyValue(),
                pricing.mandatoryMonthlyFee(),
                pricing.totalMonthlyValue(),
                pricing.oneTimeFee(),
                pricing.mandatoryFeeDescription(),
                plan.getCoverages().stream()
                        .map(item -> new CoverageOption(
                                item.getCoverage().getCode(),
                                item.getCoverage().getName(),
                                item.getStatus(),
                                item.getDetail(),
                                item.getMonthlyPrice()
                        ))
                        .toList()
        ));
    }

    private String buildQuoteNumber() {
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        return "NH-" + Year.now().getValue() + "-" + suffix;
    }

    private void validateYear(Integer year) {
        int currentYear = Year.now().getValue() + 1;
        if (year < 1950 || year > currentYear) {
            throw new IllegalArgumentException("Ano de fabricação inválido.");
        }
    }

    private String buildTeamWhatsappUrl(Quotation quotation) {
        if (teamWhatsappNumber == null || teamWhatsappNumber.isBlank()
                || quotation.getDriveFolderUrl() == null || quotation.getInspectionCompletedAt() == null) {
            return null;
        }
        String pdfUrl = quotation.getDrivePdfUrl() == null || quotation.getDrivePdfUrl().isBlank()
                ? publicPdfUrl(quotation)
                : quotation.getDrivePdfUrl();
        String message = "Vistoria concluída - " + quotation.getQuoteNumber()
                + "\nCliente: " + quotation.getCustomerName()
                + "\nPlaca: " + quotation.getPlate()
                + "\nPasta da vistoria: " + quotation.getDriveFolderUrl()
                + "\nPDF da cotação e vistoria: " + pdfUrl;
        return whatsappUrl(teamWhatsappNumber, message);
    }

    private String buildClientWhatsappUrl(Quotation quotation) {
        if (quotation.getWhatsapp() == null || quotation.getWhatsapp().isBlank()) {
            return null;
        }
        String message = "Olá, " + quotation.getCustomerName()
                + "! Segue o PDF da sua cotação " + quotation.getQuoteNumber()
                + " da Novo Horizonte Proteção Veicular: " + publicPdfUrl(quotation);
        return whatsappUrl(quotation.getWhatsapp(), message);
    }

    private String whatsappUrl(String phone, String message) {
        String normalizedPhone = phone.startsWith("55") ? phone : "55" + phone;
        return "https://wa.me/" + normalizedPhone + "?text="
                + UriUtils.encode(message, StandardCharsets.UTF_8);
    }

    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) {
            return null;
        }
        return phone.replaceAll("\\D", "");
    }

    private static String stripTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            return "http://localhost:8080";
        }
        return value.replaceAll("/+$", "");
    }
}
