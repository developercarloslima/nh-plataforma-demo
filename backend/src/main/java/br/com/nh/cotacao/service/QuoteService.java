package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.InspectionDtos.InspectionResponse;
import br.com.nh.cotacao.dto.QuoteDtos.*;
import br.com.nh.cotacao.entity.*;
import br.com.nh.cotacao.repository.PlanRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
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
    private final RetratoService retratoService;
    private final String publicApiUrl;
    private final CommunicationSettingsService communicationSettings;

    public QuoteService(
            PlanRepository planRepository,
            QuotationRepository quotationRepository,
            PricingService pricingService,
            ConsultantService consultantService,
            RetratoService retratoService,
            CommunicationSettingsService communicationSettings,
            @Value("${app.public-api-url:http://localhost:8080}") String publicApiUrl
    ) {
        this.planRepository = planRepository;
        this.quotationRepository = quotationRepository;
        this.pricingService = pricingService;
        this.consultantService = consultantService;
        this.retratoService = retratoService;
        this.publicApiUrl = stripTrailingSlash(publicApiUrl);
        this.communicationSettings = communicationSettings;
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
        PlanSelection selection = resolvePlan(
                request.selectedPlanCode(), request.categoryCode(), request.region(),
                request.fipeValue(), request.selectedOptionalCodes()
        );
        Consultant consultant = consultantService.findActive(request.consultantId());

        Quotation quotation = Quotation.createForConsultant(
                buildQuoteNumber(),
                consultant,
                request.customerName(),
                normalizePhone(request.whatsapp()),
                request.plate(),
                request.model(),
                request.manufactureYear(),
                request.zeroKm(),
                request.fipeValue(),
                request.categoryCode(),
                request.region(),
                selection.plan().getCode(),
                selection.plan().getName(),
                selection.pricing().tableMonthlyValue(),
                selection.pricing().mandatoryMonthlyFee(),
                selection.pricing().oneTimeFee(),
                selection.pricing().mandatoryFeeDescription()
        );
        applyCatalogSnapshot(quotation, selection.plan(), selection.optionals());
        return toResponse(quotationRepository.save(quotation));
    }

    @Transactional
    public QuoteResponse createPublic(CreatePublicQuoteRequest request) {
        validateYear(request.manufactureYear());
        String cpf = normalizeCpf(request.cpf());
        if (!validCpf(cpf)) throw new IllegalArgumentException("Informe um CPF válido.");

        String whatsapp = normalizePhone(request.whatsapp());
        if (whatsapp == null || whatsapp.length() < 10 || whatsapp.length() > 13) {
            throw new IllegalArgumentException("Informe um WhatsApp válido com DDD.");
        }

        PlanSelection selection = resolvePlan(
                request.selectedPlanCode(), request.categoryCode(), request.region(),
                request.fipeValue(), request.selectedOptionalCodes()
        );

        Quotation quotation = Quotation.createSelfService(
                buildQuoteNumber(),
                request.customerName(),
                cpf,
                whatsapp,
                request.plate(),
                request.model(),
                request.manufactureYear(),
                request.zeroKm(),
                request.fipeValue(),
                request.categoryCode(),
                request.region(),
                selection.plan().getCode(),
                selection.plan().getName(),
                selection.pricing().tableMonthlyValue(),
                selection.pricing().mandatoryMonthlyFee(),
                selection.pricing().oneTimeFee(),
                selection.pricing().mandatoryFeeDescription()
        );
        applyCatalogSnapshot(quotation, selection.plan(), selection.optionals());
        return toResponse(quotationRepository.save(quotation));
    }

    private PlanSelection resolvePlan(
            String selectedPlanCode,
            String categoryCode,
            Region region,
            BigDecimal fipeValue,
            List<String> selectedOptionalCodes
    ) {
        Plan selectedPlan = planRepository.findByCodeAndActiveTrue(selectedPlanCode)
                .orElseThrow(() -> new IllegalArgumentException("Plano selecionado não encontrado."));

        if (!selectedPlan.getCategory().getCode().equals(categoryCode) || selectedPlan.getRegion() != region) {
            throw new IllegalArgumentException("O plano selecionado não pertence à categoria/região informada.");
        }

        PricingService.PricingResult pricing = pricingService.calculateBreakdown(selectedPlan, fipeValue)
                .orElseThrow(() -> new IllegalArgumentException("O valor FIPE está fora da tabela do plano selecionado."));

        List<PlanCoverage> optionals = resolveSelectedOptionals(selectedPlan, selectedOptionalCodes);
        return new PlanSelection(selectedPlan, pricing, optionals);
    }

    private void applyCatalogSnapshot(Quotation quotation, Plan selectedPlan, List<PlanCoverage> selectedOptionals) {
        selectedOptionals.forEach(item -> quotation.addOptional(
                item.getCoverage().getCode(),
                item.getCoverage().getName(),
                item.getDetail(),
                item.getMonthlyPrice()
        ));

        selectedPlan.getCoverages().stream()
                .sorted(Comparator.comparing(PlanCoverage::getSortOrder).thenComparing(PlanCoverage::getId))
                .forEach(item -> quotation.addCoverageSnapshot(
                        item.getCoverage().getCode(),
                        item.getCoverage().getName(),
                        item.getStatus(),
                        item.getDetail(),
                        item.getMonthlyPrice(),
                        item.getSortOrder()
                ));
    }

    @Transactional(readOnly = true)
    public QuoteResponse get(UUID id) {
        return toResponse(find(id));
    }

    @Transactional(readOnly = true)
    public QuoteResponse getPublic(UUID id) {
        Quotation quotation = find(id);
        requireSelfService(quotation);
        return toResponse(quotation);
    }

    @Transactional
    public DecisionResponse decide(UUID id, DecisionRequest request) {
        Quotation quotation = find(id);
        if (quotation.getOrigin() != QuoteOrigin.CONSULTANT) {
            throw new IllegalArgumentException("Esta cotação foi criada pelo cliente e deve ser respondida pelo fluxo público.");
        }
        validateDecision(quotation, request);
        quotation.decide(request.decision());
        quotationRepository.save(quotation);
        return new DecisionResponse(toResponse(quotation), null, null);
    }

    @Transactional
    public DecisionResponse decidePublic(UUID id, DecisionRequest request) {
        Quotation quotation = find(id);
        requireSelfService(quotation);
        validateDecision(quotation, request);
        quotation.decide(request.decision());
        quotationRepository.saveAndFlush(quotation);

        String inspectionUrl = null;
        String whatsappUrl = null;
        if (request.decision() == QuoteStatus.ACCEPTED) {
            InspectionResponse inspection = retratoService.ensureForSelfServiceQuote(quotation);
            inspectionUrl = inspection.publicUrl();
            whatsappUrl = buildSelfServiceWhatsappUrl(quotation, inspectionUrl);
        }

        return new DecisionResponse(toResponse(quotation), inspectionUrl, whatsappUrl);
    }

    private void validateDecision(Quotation quotation, DecisionRequest request) {
        if (request.decision() != QuoteStatus.ACCEPTED && request.decision() != QuoteStatus.DECLINED) {
            throw new IllegalArgumentException("Use ACCEPTED ou DECLINED para responder à proposta.");
        }
        if (quotation.getStatus() != QuoteStatus.CREATED && quotation.getStatus() != QuoteStatus.UNDER_REVIEW) {
            throw new IllegalArgumentException("Esta proposta já possui uma decisão registrada.");
        }
        if (OffsetDateTime.now().isAfter(quotation.getValidUntil())) {
            throw new IllegalArgumentException("Esta cotação expirou. Gere uma nova proposta.");
        }
    }

    private void requireSelfService(Quotation quotation) {
        if (quotation.getOrigin() != QuoteOrigin.SELF_SERVICE) {
            throw new IllegalArgumentException("Cotação pública não encontrada.");
        }
    }

    @Transactional(readOnly = true)
    public Quotation find(UUID id) {
        return quotationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
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
        String inspectionUrl = null;
        String selfServiceWhatsappUrl = null;

        if (quotation.getOrigin() == QuoteOrigin.SELF_SERVICE && quotation.getStatus() == QuoteStatus.ACCEPTED) {
            var inspection = retratoService.findForQuotation(quotation.getId()).orElse(null);
            if (inspection != null) {
                inspectionUrl = inspection.publicUrl();
                selfServiceWhatsappUrl = buildSelfServiceWhatsappUrl(quotation, inspectionUrl);
            }
        }

        return new QuoteResponse(
                quotation.getId(),
                quotation.getQuoteNumber(),
                quotation.getOrigin(),
                quotation.getConsultant() == null ? null : quotation.getConsultant().getId(),
                quotation.getConsultantName(),
                quotation.getCustomerName(),
                maskCpf(quotation.getCustomerCpf()),
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
                (quotation.getStatus() == QuoteStatus.CREATED || quotation.getStatus() == QuoteStatus.UNDER_REVIEW)
                        && OffsetDateTime.now().isAfter(quotation.getValidUntil()),
                quotation.getDecidedAt(),
                quotation.getDriveFolderUrl(),
                quotation.getDrivePdfUrl(),
                quotation.getInspectionCompletedAt(),
                inspectionPhotos,
                teamWhatsappUrl,
                clientWhatsappUrl,
                inspectionUrl,
                selfServiceWhatsappUrl
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
        String teamWhatsappNumber = communicationSettings.teamWhatsapp();
        if (teamWhatsappNumber == null || teamWhatsappNumber.isBlank()) return null;
        String pdfUrl = quotation.getDrivePdfUrl() == null || quotation.getDrivePdfUrl().isBlank()
                ? publicPdfUrl(quotation)
                : quotation.getDrivePdfUrl();
        String message = "Cotação " + quotation.getQuoteNumber()
                + "\nCliente: " + quotation.getCustomerName()
                + "\nOrigem: " + originLabel(quotation)
                + "\nResponsável: " + quotation.getConsultantName()
                + "\nPlaca: " + quotation.getPlate()
                + "\nPlano: " + quotation.getSelectedPlanName()
                + (quotation.getDriveFolderUrl() == null ? "" : "\nPasta da vistoria: " + quotation.getDriveFolderUrl())
                + "\nPDF: " + pdfUrl;
        return whatsappUrl(teamWhatsappNumber, message);
    }

    private String buildClientWhatsappUrl(Quotation quotation) {
        if (quotation.getWhatsapp() == null || quotation.getWhatsapp().isBlank()) return null;
        String message = "Olá, " + quotation.getCustomerName()
                + "! Segue o PDF da sua cotação " + quotation.getQuoteNumber()
                + " da Novo Horizonte Proteção Veicular: " + publicPdfUrl(quotation);
        return whatsappUrl(quotation.getWhatsapp(), message);
    }

    private String buildSelfServiceWhatsappUrl(Quotation quotation, String inspectionUrl) {
        String teamWhatsappNumber = communicationSettings.teamWhatsapp();
        if (teamWhatsappNumber == null || teamWhatsappNumber.isBlank()) return null;
        String message = "Olá! Fiz uma cotação pelo site da Novo Horizonte e aceitei a proposta."
                + "\n\nCotação: " + quotation.getQuoteNumber()
                + "\nNome: " + quotation.getCustomerName()
                + "\nPlaca: " + quotation.getPlate()
                + "\nPlano: " + quotation.getSelectedPlanName()
                + "\nValor mensal: R$ " + quotation.getMonthlyValue().toPlainString().replace('.', ',')
                + "\n\nLink para enviar as fotos e o vídeo da vistoria digital: " + inspectionUrl;
        return whatsappUrl(teamWhatsappNumber, message);
    }

    private String originLabel(Quotation quotation) {
        return quotation.getOrigin() == QuoteOrigin.SELF_SERVICE ? "Cliente pelo site" : "Consultor";
    }

    private String whatsappUrl(String phone, String message) {
        String digits = phone.replaceAll("\\D", "");
        String normalizedPhone = digits.startsWith("55") ? digits : "55" + digits;
        return "https://wa.me/" + normalizedPhone + "?text="
                + UriUtils.encode(message, StandardCharsets.UTF_8);
    }

    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) return null;
        return phone.replaceAll("\\D", "");
    }

    private static String normalizeCpf(String cpf) {
        return cpf == null ? "" : cpf.replaceAll("\\D", "");
    }

    private static String maskCpf(String cpf) {
        return cpf != null && cpf.length() == 11
                ? "***." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-**"
                : null;
    }

    private static boolean validCpf(String cpf) {
        if (cpf == null || !cpf.matches("\\d{11}") || cpf.chars().distinct().count() == 1) return false;
        try {
            int sum = 0;
            for (int i = 0; i < 9; i++) sum += Character.digit(cpf.charAt(i), 10) * (10 - i);
            int first = 11 - (sum % 11);
            if (first >= 10) first = 0;
            sum = 0;
            for (int i = 0; i < 10; i++) sum += Character.digit(cpf.charAt(i), 10) * (11 - i);
            int second = 11 - (sum % 11);
            if (second >= 10) second = 0;
            return first == Character.digit(cpf.charAt(9), 10)
                    && second == Character.digit(cpf.charAt(10), 10);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String stripTrailingSlash(String value) {
        if (value == null || value.isBlank()) return "http://localhost:8080";
        return value.replaceAll("/+$", "");
    }

    private record PlanSelection(
            Plan plan,
            PricingService.PricingResult pricing,
            List<PlanCoverage> optionals
    ) {}
}
