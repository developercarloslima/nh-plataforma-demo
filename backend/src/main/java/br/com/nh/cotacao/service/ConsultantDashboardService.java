package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.ConsultantDashboardDtos.*;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.Quotation;
import br.com.nh.cotacao.entity.QuoteStatus;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ConsultantDashboardService {
    private final ConsultantService consultantService;
    private final QuotationRepository quotationRepository;
    private final InspectionRequestRepository inspectionRepository;

    public ConsultantDashboardService(
            ConsultantService consultantService,
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository
    ) {
        this.consultantService = consultantService;
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
    }

    @Transactional(readOnly = true)
    public ConsultantDashboardResponse dashboard(UUID consultantId) {
        var consultant = consultantService.findActive(consultantId);
        List<InspectionRequest> inspections = inspectionRepository.findAllByConsultant_IdOrderByCreatedAtDesc(consultantId);
        Map<UUID, InspectionRequest> inspectionsByQuote = inspections.stream()
                .filter(item -> item.getQuotation() != null)
                .collect(Collectors.toMap(
                        item -> item.getQuotation().getId(),
                        Function.identity(),
                        (left, right) -> left.getCreatedAt().isAfter(right.getCreatedAt()) ? left : right
                ));

        List<ConsultantQuoteSummary> quotes = quotationRepository.findAllByConsultant_IdOrderByCreatedAtDesc(consultantId)
                .stream()
                .map(item -> toQuote(item, inspectionsByQuote.get(item.getId())))
                .toList();

        List<ConsultantInspectionSummary> inspectionItems = inspections.stream()
                .map(this::toInspection)
                .toList();

        return new ConsultantDashboardResponse(consultant.getId(), consultant.getName(), quotes, inspectionItems);
    }

    private ConsultantQuoteSummary toQuote(Quotation item, InspectionRequest inspection) {
        boolean expired = (item.getStatus() == QuoteStatus.CREATED || item.getStatus() == QuoteStatus.UNDER_REVIEW)
                && OffsetDateTime.now().isAfter(item.getValidUntil());
        InspectionRequestStatus inspectionStatus = inspection == null ? null : inspection.getStatus();
        OffsetDateTime inspectionCompletedAt = inspection == null ? item.getInspectionCompletedAt() : inspection.getCompletedAt();
        return new ConsultantQuoteSummary(
                item.getId(), item.getQuoteNumber(), item.getCustomerName(), item.getPlate(), item.isZeroKm(),
                item.getModel(), item.getSelectedPlanName(), item.getStatus(), item.getCreatedAt(), item.getValidUntil(),
                expired, inspectionStatus, inspectionCompletedAt
        );
    }

    @Transactional
    public ConsultantInspectionSummary markCompletionMessageSent(UUID inspectionId) {
        InspectionRequest inspection = inspectionRepository.findById(inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        inspection.markCompletionMessageSent();
        return toInspection(inspectionRepository.save(inspection));
    }

    private ConsultantInspectionSummary toInspection(InspectionRequest item) {
        String completionUrl = associateCompletionWhatsappUrl(item);
        boolean pending = completionUrl != null
                && item.getCompletionMessageSentAt() == null
                && item.getCompletedAt() != null
                && (item.getStatus() == InspectionRequestStatus.COMPLETED
                    || item.getStatus() == InspectionRequestStatus.UNDER_REVIEW);
        return new ConsultantInspectionSummary(
                item.getId(), item.getRequestType(), item.getAssociateName(), item.getPlate(), item.getStatus(),
                item.getCreatedAt(), item.getExpiresAt(), item.getCompletedAt(), item.getReportUrl(),
                item.getWhatsapp(), completionUrl, item.getCompletionMessageSentAt(), pending
        );
    }

    private String associateCompletionWhatsappUrl(InspectionRequest item) {
        String phone = normalizePhone(item.getWhatsapp());
        if (phone == null) return null;
        String firstName = item.getAssociateName() == null || item.getAssociateName().isBlank()
                ? "associado" : item.getAssociateName().trim().split("\\s+")[0];
        String message = "Olá, " + firstName
                + "! Sua vistoria foi realizada com sucesso. Aguarde a análise da equipe Novo Horizonte Proteção Veicular.";
        return "https://wa.me/" + phone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);
    }

    private String normalizePhone(String value) {
        if (value == null || value.isBlank()) return null;
        String digits = value.replaceAll("\\D", "");
        if (digits.length() == 10 || digits.length() == 11) digits = "55" + digits;
        return digits.matches("^[1-9][0-9]{11,14}$") ? digits : null;
    }
}
