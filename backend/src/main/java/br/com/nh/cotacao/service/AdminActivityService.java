package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.AdminDtos.*;
import br.com.nh.cotacao.entity.*;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class AdminActivityService {
    private static final String DEFAULT_PUBLIC_WEB_URL = "https://aforma-demo.vercel.app";
    private final QuotationRepository quotationRepository;
    private final InspectionRequestRepository inspectionRepository;
    private final CatalogChangeAuditRepository auditRepository;
    private final CommunicationSettingsService settingsService;
    private final String publicApiUrl;
    private final String publicWebUrl;

    public AdminActivityService(
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository,
            CatalogChangeAuditRepository auditRepository,
            CommunicationSettingsService settingsService,
            @Value("${app.public-api-url:http://localhost:8080}") String publicApiUrl,
            @Value("${app.public-web-url:https://aforma-demo.vercel.app}") String publicWebUrl
    ) {
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
        this.auditRepository = auditRepository;
        this.settingsService = settingsService;
        this.publicApiUrl = stripTrailingSlash(publicApiUrl);
        this.publicWebUrl = normalizePublicWebUrl(publicWebUrl);
    }

    @Transactional(readOnly = true)
    public List<AdminQuoteResponse> quotes() {
        return quotationRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toQuote).toList();
    }

    @Transactional
    public AdminQuoteResponse updateQuoteStatus(UUID id, UpdateQuoteStatusRequest request, String username) {
        Quotation quotation = quotationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
        String old = quoteAnalysisSummary(quotation);
        quotation.adminReview(request.status(), request.adminNote());
        quotationRepository.save(quotation);
        auditRepository.save(CatalogChangeAudit.createText(
                "QUOTE_STATUS", null, id.toString(), "Cotação " + quotation.getQuoteNumber() + " analisada",
                old, quoteAnalysisSummary(quotation), username
        ));
        return toQuote(quotation);
    }

    @Transactional(readOnly = true)
    public List<AdminInspectionResponse> inspections() {
        return inspectionRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toInspection).toList();
    }

    @Transactional
    public AdminInspectionResponse updateInspectionStatus(UUID id, UpdateInspectionStatusRequest request, String username) {
        InspectionRequest inspection = inspectionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        String old = inspectionAnalysisSummary(inspection);
        inspection.adminReview(request.status(), request.adminNote());
        inspectionRepository.save(inspection);
        auditRepository.save(CatalogChangeAudit.createText(
                "INSPECTION_STATUS", null, id.toString(), "Retrato NH de " + inspection.getAssociateName() + " analisado",
                old, inspectionAnalysisSummary(inspection), username
        ));
        return toInspection(inspection);
    }

    private AdminQuoteResponse toQuote(Quotation item) {
        boolean expired = (item.getStatus() == QuoteStatus.CREATED || item.getStatus() == QuoteStatus.UNDER_REVIEW)
                && OffsetDateTime.now().isAfter(item.getValidUntil());
        String pdfUrl = publicApiUrl + "/api/quotes/" + item.getId() + "/pdf";
        String whatsapp = settingsService.teamWhatsapp();
        String email = settingsService.teamEmail();
        String inspectionUrl = inspectionRepository.findByQuotation_Id(item.getId())
                .map(inspection -> publicWebUrl + "/retrato/?token=" + inspection.getPublicToken())
                .orElse(null);
        String message = "Cotação " + item.getQuoteNumber()
                + "\nCliente: " + item.getCustomerName()
                + "\nOrigem: " + (item.getOrigin() == QuoteOrigin.SELF_SERVICE ? "Cliente pelo site" : "Consultor")
                + "\nResponsável: " + item.getConsultantName()
                + "\nPlaca: " + plateLabel(item.getPlate(), item.isZeroKm())
                + "\nPlano: " + item.getSelectedPlanName()
                + "\nPDF: " + pdfUrl;
        String subject = "Cotação " + item.getQuoteNumber() + " - Novo Horizonte";
        return new AdminQuoteResponse(
                item.getId(), item.getQuoteNumber(), item.getOrigin(),
                item.getConsultant() == null ? null : item.getConsultant().getId(),
                item.getConsultantName(), item.getCustomerName(), maskCpf(item.getCustomerCpf()), item.getWhatsapp(),
                item.getPlate(), item.getModel(), item.getManufactureYear(), item.isZeroKm(), item.getFipeValue(),
                item.getCategoryCode(), item.getRegion(), item.getSelectedPlanName(), item.getMonthlyValue(), item.getOneTimeFee(),
                item.getStatus(), item.getCreatedAt(), item.getValidUntil(), expired, item.getDecidedAt(), item.getAdminNote(),
                item.getReviewedAt(), pdfUrl, item.getDriveFolderUrl(), item.getDrivePdfUrl(), inspectionUrl,
                whatsappUrl(whatsapp, message), emailUrl(email, subject, message)
        );
    }

    private AdminInspectionResponse toInspection(InspectionRequest item) {
        String publicUrl = publicWebUrl + "/retrato/?token=" + item.getPublicToken();
        String whatsapp = settingsService.teamWhatsapp();
        String email = settingsService.teamEmail();
        String type = item.getRequestType() == InspectionRequestType.NEW_INSPECTION
                ? "Nova vistoria" : "Atualização de boleto";
        String plateLabel = plateLabel(item.getPlate(), item.getRequestType() == InspectionRequestType.NEW_INSPECTION);
        String signatureUrl = item.getAssets().stream()
                .filter(asset -> asset.getAssetType() == InspectionAssetType.SIGNATURE)
                .map(InspectionAsset::getDriveFileUrl)
                .filter(url -> url != null && !url.isBlank())
                .findFirst()
                .orElse(null);
        String message = "Retrato NH - " + type
                + "\nAssociado: " + item.getAssociateName()
                + "\nConsultor: " + item.getConsultantName()
                + "\nPlaca: " + plateLabel
                + (item.getDriveFolderUrl() == null ? "\nLink: " + publicUrl : "\nDrive: " + item.getDriveFolderUrl())
                + (item.getReportUrl() == null ? "" : "\nRelatório: " + item.getReportUrl());
        String subject = "Retrato NH - " + plateLabel;
        return new AdminInspectionResponse(
                item.getId(), item.getRequestType().name(), item.getAssociateName(), maskCpf(item.getCpf()),
                item.getWhatsapp(), item.getPlate(), item.getResidenceAddress(), signatureUrl,
                item.getConsultant() == null ? null : item.getConsultant().getId(), item.getConsultantName(), item.getStatus(), item.getCreatedAt(), item.getExpiresAt(), item.getCompletedAt(),
                item.getAdminNote(), item.getReviewedAt(), publicUrl, item.getDriveFolderUrl(), item.getReportUrl(),
                whatsappUrl(whatsapp, message), emailUrl(email, subject, message), item.getAssets().size()
        );
    }

    private String quoteAnalysisSummary(Quotation item) {
        return "status=" + item.getStatus() + "; observação=" + value(item.getAdminNote());
    }

    private String inspectionAnalysisSummary(InspectionRequest item) {
        return "status=" + item.getStatus() + "; observação=" + value(item.getAdminNote());
    }

    private String whatsappUrl(String phone, String message) {
        if (phone == null || phone.isBlank()) return null;
        String normalized = phone.replaceAll("\\D", "");
        return "https://wa.me/" + normalized + "?text=" + UriUtils.encode(message, StandardCharsets.UTF_8);
    }

    private String emailUrl(String email, String subject, String body) {
        if (email == null || email.isBlank()) return null;
        return "mailto:" + email + "?subject=" + UriUtils.encode(subject, StandardCharsets.UTF_8)
                + "&body=" + UriUtils.encode(body, StandardCharsets.UTF_8);
    }

    private String plateLabel(String plate, boolean zeroKm) {
        return plate == null || plate.isBlank() ? (zeroKm ? "Veículo 0 km — sem placa" : "Sem placa") : plate;
    }

    private String value(String value) { return value == null || value.isBlank() ? "—" : value; }
    private String stripTrailingSlash(String value) { return value == null ? "" : value.replaceAll("/+$", ""); }
    private String normalizePublicWebUrl(String value) {
        String normalized = stripTrailingSlash(value);
        if (normalized.isBlank() || normalized.matches("(?i)^https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?$")) {
            return DEFAULT_PUBLIC_WEB_URL;
        }
        return normalized;
    }
    private String maskCpf(String cpf) {
        return cpf != null && cpf.length() == 11
                ? "***." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-**"
                : "***.***.***-**";
    }
}
