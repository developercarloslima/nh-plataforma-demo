package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.ConsultantDashboardDtos.*;
import br.com.nh.cotacao.dto.InspectionDtos.InspectionResponse;
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
import java.util.ArrayList;
import java.util.Comparator;
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
    private final RetratoService retratoService;
    private final InspectionAssetStorageService storageService;

    public ConsultantDashboardService(
            ConsultantService consultantService,
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository,
            RetratoService retratoService,
            InspectionAssetStorageService storageService
    ) {
        this.consultantService = consultantService;
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
        this.retratoService = retratoService;
        this.storageService = storageService;
    }

    @Transactional
    public ConsultantDashboardResponse dashboard(UUID consultantId) {
        var consultant = consultantService.findActive(consultantId);
        List<Quotation> quoteEntities = quotationRepository.findAllByConsultant_IdOrderByCreatedAtDesc(consultantId);
        List<InspectionRequest> inspections = new ArrayList<>(inspectionRepository.findAllByConsultant_IdOrderByCreatedAtDesc(consultantId));
        Map<UUID, InspectionRequest> inspectionsByQuote = inspections.stream()
                .filter(item -> item.getQuotation() != null)
                .collect(Collectors.toMap(
                        item -> item.getQuotation().getId(),
                        Function.identity(),
                        (left, right) -> left.getCreatedAt().isAfter(right.getCreatedAt()) ? left : right
                ));

        for (Quotation quotation : quoteEntities) {
            if (quotation.getStatus() == QuoteStatus.ACCEPTED && !inspectionsByQuote.containsKey(quotation.getId())) {
                InspectionResponse created = retratoService.ensureForQuotation(quotation);
                InspectionRequest createdInspection = inspectionRepository.findById(created.id())
                        .orElseThrow(() -> new IllegalStateException("A vistoria foi criada, mas não pôde ser carregada."));
                inspections.add(createdInspection);
                inspectionsByQuote.put(quotation.getId(), createdInspection);
            }
        }

        inspections.sort(Comparator.comparing(InspectionRequest::getCreatedAt).reversed());

        List<ConsultantQuoteSummary> quotes = quoteEntities.stream()
                .map(item -> toQuote(item, inspectionsByQuote.get(item.getId())))
                .toList();

        List<ConsultantInspectionSummary> inspectionItems = inspections.stream()
                .map(this::toInspection)
                .toList();

        return new ConsultantDashboardResponse(consultant.getId(), consultant.getName(), quotes, inspectionItems);
    }

    @Transactional
    public ConsultantInspectionSummary ensureInspection(UUID consultantId, UUID quoteId) {
        var consultant = consultantService.findActive(consultantId);
        Quotation quotation = quotationRepository.findById(quoteId)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
        if (quotation.getConsultant() == null || !consultant.getId().equals(quotation.getConsultant().getId())) {
            throw new IllegalArgumentException("Esta cotação não pertence ao consultor selecionado.");
        }
        InspectionResponse created = retratoService.ensureForQuotation(quotation);
        InspectionRequest inspection = inspectionRepository.findById(created.id())
                .orElseThrow(() -> new IllegalStateException("A vistoria foi criada, mas não pôde ser carregada."));
        return toInspection(inspection);
    }

    private ConsultantQuoteSummary toQuote(Quotation item, InspectionRequest inspection) {
        boolean expired = (item.getStatus() == QuoteStatus.CREATED || item.getStatus() == QuoteStatus.UNDER_REVIEW)
                && OffsetDateTime.now().isAfter(item.getValidUntil());
        InspectionRequestStatus inspectionStatus = displayStatus(inspection);
        OffsetDateTime inspectionCompletedAt = inspection == null ? item.getInspectionCompletedAt() : inspection.getCompletedAt();
        InspectionResponse inspectionResponse = inspection == null ? null : retratoService.toResponse(inspection);
        boolean hasFiles = hasFiles(inspection);
        return new ConsultantQuoteSummary(
                item.getId(), item.getQuoteNumber(), item.getCustomerName(), item.getPlate(), item.isZeroKm(),
                item.getModel(), item.getSelectedPlanName(), item.getStatus(), item.getCreatedAt(), item.getValidUntil(),
                expired,
                inspection == null ? null : inspection.getId(),
                inspectionStatus,
                inspectionCompletedAt,
                inspectionResponse == null ? null : inspectionResponse.publicUrl(),
                inspectionResponse == null ? null : inspectionResponse.whatsappUrl(),
                null,
                hasFiles,
                inspection == null ? 0 : (int) inspection.getAssets().stream().filter(storageService::isAvailable).count()
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
        InspectionResponse response = retratoService.toResponse(item);
        String completionUrl = associateCompletionWhatsappUrl(item);
        boolean pending = completionUrl != null
                && item.getCompletionMessageSentAt() == null
                && item.getCompletedAt() != null
                && (item.getStatus() == InspectionRequestStatus.COMPLETED
                    || item.getStatus() == InspectionRequestStatus.UNDER_REVIEW);
        List<br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse> assets = item.getAssets().stream()
                .map(asset -> new br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse(
                        asset.getId(), asset.getAssetType(), asset.getLabel(), asset.getFileName(),
                        asset.getContentType(), asset.getFileSize(), null, asset.getSortOrder(),
                        storageService.isAvailable(asset), asset.getStoredAt(), asset.getExpiresAt(), asset.getPurgedAt()
                ))
                .toList();
        int availableCount = (int) assets.stream()
                .filter(br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse::available)
                .count();
        OffsetDateTime filesExpireAt = assets.stream()
                .filter(br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse::available)
                .map(br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse::expiresAt)
                .filter(java.util.Objects::nonNull)
                .max(OffsetDateTime::compareTo)
                .orElse(null);
        return new ConsultantInspectionSummary(
                item.getId(), item.getRequestType(), item.getAssociateName(), item.getPlate(), displayStatus(item),
                item.getCreatedAt(), item.getExpiresAt(), item.getCompletedAt(), null,
                item.getWhatsapp(), completionUrl, item.getCompletionMessageSentAt(), pending,
                response.publicUrl(), response.whatsappUrl(), null, availableCount > 0, availableCount,
                filesExpireAt, assets
        );
    }

    private InspectionRequestStatus displayStatus(InspectionRequest item) {
        if (item == null) return null;
        long availableCount = item.getAssets().stream().filter(storageService::isAvailable).count();
        if (availableCount == 0
                && item.getStatus() != InspectionRequestStatus.CANCELLED
                && item.getStatus() != InspectionRequestStatus.EXPIRED) {
            return InspectionRequestStatus.WAITING_FILES;
        }
        if (availableCount > 0
                && (item.getStatus() == InspectionRequestStatus.WAITING_FILES
                    || item.getStatus() == InspectionRequestStatus.CREATED)) {
            return InspectionRequestStatus.UPLOADING_FILES;
        }
        return item.getStatus();
    }

    private boolean hasFiles(InspectionRequest item) {
        return item != null && item.getAssets().stream().anyMatch(storageService::isAvailable);
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
