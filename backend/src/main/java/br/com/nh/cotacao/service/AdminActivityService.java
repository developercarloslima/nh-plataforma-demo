package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.AdminDtos.*;
import br.com.nh.cotacao.entity.*;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import br.com.nh.cotacao.security.PortalRole;
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
    private final InspectionAssetStorageService storageService;
    private final ConsultantService consultantService;
    private final PortalUserService portalUserService;
    private final RetratoService retratoService;
    private final String publicApiUrl;
    private final String publicWebUrl;

    public AdminActivityService(
            QuotationRepository quotationRepository,
            InspectionRequestRepository inspectionRepository,
            CatalogChangeAuditRepository auditRepository,
            CommunicationSettingsService settingsService,
            InspectionAssetStorageService storageService,
            ConsultantService consultantService,
            PortalUserService portalUserService,
            RetratoService retratoService,
            @Value("${app.public-api-url:http://localhost:8080}") String publicApiUrl,
            @Value("${app.public-web-url:https://aforma-demo.vercel.app}") String publicWebUrl
    ) {
        this.quotationRepository = quotationRepository;
        this.inspectionRepository = inspectionRepository;
        this.auditRepository = auditRepository;
        this.settingsService = settingsService;
        this.storageService = storageService;
        this.consultantService = consultantService;
        this.portalUserService = portalUserService;
        this.retratoService = retratoService;
        this.publicApiUrl = stripTrailingSlash(publicApiUrl);
        this.publicWebUrl = normalizePublicWebUrl(publicWebUrl);
    }

    @Transactional(readOnly = true)
    public List<AdminQuoteResponse> quotes() {
        return quotationRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toQuote).toList();
    }

    @Transactional
    public AdminQuoteResponse updateQuoteConsultant(UUID id, UpdateQuoteConsultantRequest request, String username) {
        Quotation quotation = quotationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
        if (quotation.getOrigin() != QuoteOrigin.SELF_SERVICE) {
            throw new IllegalArgumentException("A troca de responsável por esta tela é permitida apenas para cotações feitas pelo site.");
        }

        Consultant consultant = consultantService.findActive(request.consultantId());
        String oldConsultant = quotation.getConsultantName();
        quotation.assignConsultant(consultant);

        inspectionRepository.findByQuotation_Id(quotation.getId()).ifPresent(inspection ->
                inspection.assignConsultant(consultant)
        );

        quotationRepository.flush();
        inspectionRepository.flush();

        // Se o cliente já aceitou enquanto a distribuição automática estava desligada,
        // a atribuição manual conclui a preparação da vistoria sem exigir nova ação dele.
        if (quotation.getStatus() == QuoteStatus.ACCEPTED
                && inspectionRepository.findByQuotation_Id(quotation.getId()).isEmpty()) {
            retratoService.ensureForSelfServiceQuote(quotation);
        }

        auditRepository.save(CatalogChangeAudit.createText(
                "QUOTE_CONSULTANT", null, id.toString(),
                "Responsável da cotação " + quotation.getQuoteNumber() + " alterado",
                "consultor=" + oldConsultant,
                "consultor=" + consultant.getName(),
                username
        ));
        return toQuote(quotation);
    }

    @Transactional
    public AdminQuoteResponse updateQuoteStatus(UUID id, UpdateQuoteStatusRequest request, String username) {
        Quotation quotation = quotationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
        String old = quoteAnalysisSummary(quotation);
        quotation.adminReview(request.status(), request.adminNote());
        quotationRepository.saveAndFlush(quotation);

        // Uma cotação feita pelo site pode ser aceita enquanto a distribuição automática
        // estiver desligada. Assim que houver responsável definido, o próprio Admin pode
        // concluir a análise e a vistoria é criada sem exigir uma nova ação do cliente.
        if (quotation.getOrigin() == QuoteOrigin.SELF_SERVICE
                && quotation.getStatus() == QuoteStatus.ACCEPTED
                && quotation.getConsultant() != null
                && inspectionRepository.findByQuotation_Id(quotation.getId()).isEmpty()) {
            retratoService.ensureForSelfServiceQuote(quotation);
        }

        auditRepository.save(CatalogChangeAudit.createText(
                "QUOTE_STATUS", null, id.toString(), "Cotação " + quotation.getQuoteNumber() + " analisada",
                old, quoteAnalysisSummary(quotation), username
        ));
        return toQuote(quotation);
    }

    @Transactional
    public void deleteQuote(UUID id, String username) {
        Quotation quotation = quotationRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cotação não encontrada."));
        String number = quotation.getQuoteNumber();
        String old = "cliente=" + quotation.getCustomerName() + "; status=" + quotation.getStatus();
        quotationRepository.delete(quotation);
        quotationRepository.flush();
        auditRepository.save(CatalogChangeAudit.createText(
                "QUOTE_DELETE", null, id.toString(), "Cotação " + number + " excluída do banco",
                old, "registro excluído", username
        ));
    }

    @Transactional
    public DeleteSummary deleteAllQuotes(String username) {
        int deleted = quotationRepository.deleteAllQuotations();
        auditRepository.save(CatalogChangeAudit.createText(
                "QUOTE_DELETE", null, "BULK", "Exclusão administrativa de todas as cotações",
                "registros existentes", "excluídas=" + deleted, username
        ));
        return new DeleteSummary(deleted, 0, deleted + " cotação(ões) excluída(s) do banco.");
    }

    @Transactional(readOnly = true)
    public List<AdminInspectionResponse> inspections() {
        return inspectionRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(item -> toInspection(item, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AdminInspectionResponse> inspectionsForAnalysis(String username, PortalRole role) {
        if (role == PortalRole.ADMIN) {
            return inspectionRepository.findAllByOrderByCreatedAtDesc().stream()
                    .filter(item -> item.getAnalysisStage() == InspectionAnalysisStage.ANALYST_QUEUE
                            || item.getAnalysisStage() == InspectionAnalysisStage.ANALYST_PENDING)
                    .map(item -> toInspection(item, true))
                    .toList();
        }
        UUID analystId = portalUserService.linkedAnalystId(username).orElse(null);
        return inspectionRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(item -> item.getAnalysisStage() == InspectionAnalysisStage.ANALYST_QUEUE
                        || item.getAnalysisStage() == InspectionAnalysisStage.ANALYST_PENDING)
                .filter(item -> analystId == null
                        ? item.getAssignedAnalyst() == null
                        : (item.getAssignedAnalyst() != null && analystId.equals(item.getAssignedAnalyst().getId())))
                .map(item -> toInspection(item, true))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AdminInspectionResponse> inspectionsForSupervision() {
        return inspectionRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(item -> item.getAnalysisStage() == InspectionAnalysisStage.SUPERVISION_QUEUE
                        || (item.getAnalysisStage() == InspectionAnalysisStage.FINISHED
                            && "SUPERVISION_ANALYSIS".equals(item.getReviewedByRole())))
                .map(item -> toInspection(item, true))
                .toList();
    }

    @Transactional
    public AdminInspectionResponse markRegistrationCompleted(UUID id, String note, String username, PortalRole actorRole) {
        if (actorRole != PortalRole.ANALYST && actorRole != PortalRole.ADMIN) {
            throw new IllegalArgumentException("Este usuário não possui permissão para concluir o cadastro da vistoria.");
        }
        InspectionRequest inspection = inspectionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        Consultant analyst;
        if (actorRole == PortalRole.ADMIN) {
            analyst = inspection.getAssignedAnalyst();
            if (analyst == null) throw new IllegalArgumentException("Vincule um analista responsável antes de marcar Cadastro feito.");
        } else {
            UUID analystId = portalUserService.linkedAnalystId(username)
                    .orElseThrow(() -> new IllegalArgumentException("Este usuário de análise não está vinculado a um analista específico."));
            analyst = consultantService.findActiveAnalyst(analystId);
        }
        String old = inspectionAnalysisSummary(inspection);
        inspection.markRegistrationCompleted(analyst, note);
        inspectionRepository.flush();
        auditRepository.save(CatalogChangeAudit.createText(
                "INSPECTION_REGISTRATION", null, id.toString(),
                "Cadastro concluído por " + analyst.getName() + " e enviado à Supervisão de Análise",
                old, inspectionAnalysisSummary(inspection) + "; etapa=SUPERVISION_QUEUE", username
        ));
        return toInspection(inspection, true);
    }

    @Transactional
    public AdminInspectionResponse markDecisionMessageSent(UUID id) {
        return markDecisionMessageSent(id, false);
    }

    @Transactional
    public AdminInspectionResponse markDecisionMessageSentForAnalysis(UUID id, String username, PortalRole role) {
        portalUserService.assertAnalysisInspectionAccess(username, role, id);
        return markDecisionMessageSent(id, true);
    }

    @Transactional
    public AdminInspectionResponse markDecisionMessageSentForSupervision(UUID id, String username, PortalRole role) {
        portalUserService.assertSupervisionInspectionAccess(username, role, id);
        return markDecisionMessageSent(id, true);
    }

    private AdminInspectionResponse markDecisionMessageSent(UUID id, boolean revealCpf) {
        InspectionRequest inspection = inspectionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        inspection.markDecisionMessageSent();
        inspectionRepository.flush();
        return toInspection(inspection, revealCpf);
    }

    @Transactional
    public AdminInspectionResponse updateInspectionStatus(UUID id, UpdateInspectionStatusRequest request, String username) {
        return updateInspectionStatus(id, request, username, PortalRole.ADMIN, false);
    }

    @Transactional
    public AdminInspectionResponse updateInspectionStatusForAnalysis(
            UUID id,
            UpdateInspectionStatusRequest request,
            String username,
            PortalRole actorRole
    ) {
        portalUserService.assertAnalysisInspectionAccess(username, actorRole, id);
        return updateInspectionStatus(id, request, username, actorRole, true);
    }

    @Transactional
    public AdminInspectionResponse updateInspectionStatusForSupervision(
            UUID id, UpdateInspectionStatusRequest request, String username, PortalRole actorRole
    ) {
        if (actorRole != PortalRole.SUPERVISION_ANALYSIS && actorRole != PortalRole.ADMIN) {
            throw new IllegalArgumentException("Este usuário não possui permissão para supervisionar vistorias.");
        }
        if (request.status() != InspectionRequestStatus.APPROVED && request.status() != InspectionRequestStatus.REJECTED) {
            throw new IllegalArgumentException("A Supervisão de Análise pode aprovar ou rejeitar a vistoria.");
        }
        if (request.adminNote() == null || request.adminNote().isBlank()) {
            throw new IllegalArgumentException("Informe uma observação explicando o motivo da aprovação ou rejeição.");
        }
        InspectionRequest inspection = inspectionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        if (actorRole != PortalRole.ADMIN && inspection.getAnalysisStage() != InspectionAnalysisStage.SUPERVISION_QUEUE) {
            throw new IllegalArgumentException("Esta vistoria ainda não foi marcada como Cadastro feito pelo analista.");
        }
        Consultant supervisorCollaborator = null;
        String reviewerName = "Análise feita pelo administrador";
        String reviewerRole = "ADMIN";
        if (actorRole == PortalRole.SUPERVISION_ANALYSIS) {
            UUID supervisorId = portalUserService.linkedSupervisorId(username)
                    .orElseThrow(() -> new IllegalArgumentException("Este usuário de supervisão não está vinculado a um colaborador."));
            supervisorCollaborator = consultantService.findActiveSupervisor(supervisorId);
            reviewerName = supervisorCollaborator.getName();
            reviewerRole = "SUPERVISION_ANALYSIS";
        }
        String old = inspectionAnalysisSummary(inspection);
        inspection.adminReview(
                request.status(), request.adminNote(), supervisorCollaborator, reviewerName, reviewerRole,
                actorRole == PortalRole.ADMIN
        );
        inspectionRepository.flush();
        auditRepository.save(CatalogChangeAudit.createText(
                "INSPECTION_SUPERVISION", null, id.toString(),
                "Supervisão da vistoria de " + inspection.getAssociateName() + " por " + reviewerName,
                old, inspectionAnalysisSummary(inspection), username
        ));
        return toInspection(inspection, true);
    }

    private AdminInspectionResponse updateInspectionStatus(
            UUID id,
            UpdateInspectionStatusRequest request,
            String username,
            PortalRole actorRole,
            boolean revealCpf
    ) {
        InspectionRequest inspection = inspectionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        String old = inspectionAnalysisSummary(inspection);

        Consultant reviewerCollaborator = null;
        String reviewerName;
        String reviewerRole;
        if (actorRole == PortalRole.ANALYST
                && (request.status() == InspectionRequestStatus.APPROVED || request.status() == InspectionRequestStatus.REJECTED)) {
            throw new IllegalArgumentException("A decisão final da vistoria pertence à Supervisão de Análise. Marque Cadastro feito para enviar a vistoria à supervisão.");
        }
        if (actorRole == PortalRole.ADMIN
                && (request.status() == InspectionRequestStatus.APPROVED || request.status() == InspectionRequestStatus.REJECTED)
                && (request.adminNote() == null || request.adminNote().isBlank())) {
            throw new IllegalArgumentException("Informe uma observação explicando o motivo da aprovação ou rejeição da vistoria.");
        }
        if (actorRole == PortalRole.ADMIN) {
            reviewerName = "Análise feita pelo administrador";
            reviewerRole = "ADMIN";
        } else if (actorRole == PortalRole.ANALYST) {
            reviewerCollaborator = resolveAnalystReviewer(request, username);
            reviewerName = reviewerCollaborator.getName();
            reviewerRole = "ANALYST";
        } else {
            throw new IllegalArgumentException("Este usuário não possui permissão para analisar vistorias.");
        }

        inspection.adminReview(
                request.status(), request.adminNote(), reviewerCollaborator, reviewerName, reviewerRole,
                actorRole == PortalRole.ADMIN
        );
        inspectionRepository.flush();
        auditRepository.save(CatalogChangeAudit.createText(
                "INSPECTION_STATUS", null, id.toString(),
                "Retrato NH de " + inspection.getAssociateName() + " analisado por " + reviewerName,
                old, inspectionAnalysisSummary(inspection), username
        ));
        return toInspection(inspection, revealCpf);
    }

    private Consultant resolveAnalystReviewer(UpdateInspectionStatusRequest request, String username) {
        var linkedAnalyst = portalUserService.linkedAnalystId(username);
        if (linkedAnalyst.isPresent()) {
            return consultantService.findActiveAnalyst(linkedAnalyst.get());
        }
        if (request.analystId() != null) {
            return consultantService.findActiveAnalyst(request.analystId());
        }
        if (request.analystName() != null && !request.analystName().isBlank()) {
            var created = consultantService.create(
                    request.analystName(), CollaboratorRole.ANALYST, "CREATED_IN_ANALYSIS", username
            );
            return consultantService.findActiveAnalyst(created.id());
        }
        throw new IllegalArgumentException("Selecione o analista responsável ou informe o nome de um novo analista.");
    }

    @Transactional
    public void deleteInspection(UUID id, String username) {
        InspectionRequest inspection = inspectionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitação do Retrato NH não encontrada."));
        String old = "associado=" + inspection.getAssociateName() + "; placa=" + plateLabel(inspection.getPlate(), false)
                + "; status=" + inspection.getStatus();
        inspectionRepository.delete(inspection);
        inspectionRepository.flush();
        auditRepository.save(CatalogChangeAudit.createText(
                "INSPECTION_DELETE", null, id.toString(), "Retrato NH excluído do banco",
                old, "registro e arquivos excluídos", username
        ));
    }

    @Transactional
    public DeleteSummary deleteAllAllowedInspections(String username) {
        int deleted = inspectionRepository.deleteAllInspections();
        auditRepository.save(CatalogChangeAudit.createText(
                "INSPECTION_DELETE", null, "BULK", "Exclusão administrativa de todas as vistorias",
                "sem proteção por status", "excluídas=" + deleted, username
        ));
        return new DeleteSummary(
                deleted, 0,
                deleted + " vistoria(s) excluída(s), independentemente do status ou de documentos pendentes."
        );
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
                item.getAuctionOrChassisRemarked(), item.getIndemnityFipePercent(),
                item.getCategoryCode(), item.getRegion(), item.getMotorcycleOrigin(), item.getMotorcycleCc(), item.getObservation(), item.getSelectedPlanName(),
                item.getPreDiscountMonthlyValue(), item.getDiscountPercent(), item.getRearWindowBranding(), item.getMonthlyValue(), item.getOneTimeFee(),
                item.getStatus(), item.getCreatedAt(), item.getValidUntil(), expired, item.getDecidedAt(), item.getAdminNote(),
                item.getReviewedAt(), pdfUrl, item.getDriveFolderUrl(), item.getDrivePdfUrl(), inspectionUrl,
                whatsappUrl(whatsapp, message), emailUrl(email, subject, message)
        );
    }

    private AdminInspectionResponse toInspection(InspectionRequest item) {
        return toInspection(item, false);
    }

    private AdminInspectionResponse toInspection(InspectionRequest item, boolean revealCpf) {
        String publicUrl = publicWebUrl + "/retrato/?token=" + item.getPublicToken();
        String quotationPdfUrl = item.getQuotation() == null
                ? null
                : publicApiUrl + "/api/quotes/" + item.getQuotation().getId() + "/pdf";
        String whatsapp = settingsService.teamWhatsapp();
        String email = settingsService.teamEmail();
        String type = item.getRequestType() == InspectionRequestType.NEW_INSPECTION
                ? "Nova vistoria" : "Atualização de boleto";
        String plateLabel = plateLabel(item.getPlate(), item.getRequestType() == InspectionRequestType.NEW_INSPECTION);

        List<br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse> assets = item.getAssets().stream()
                .map(asset -> new br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse(
                        asset.getId(), asset.getAssetType(), asset.getLabel(), asset.getFileName(),
                        asset.getContentType(), asset.getFileSize(), null, asset.getSortOrder(),
                        storageService.isAvailable(asset), asset.getStoredAt(), asset.getExpiresAt(), asset.getPurgedAt()
                ))
                .toList();
        int availableCount = (int) assets.stream().filter(br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse::available).count();
        int expiredCount = (int) assets.stream().filter(asset -> !asset.available() && asset.purgedAt() != null).count();
        OffsetDateTime filesExpireAt = assets.stream()
                .filter(br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse::available)
                .map(br.com.nh.cotacao.dto.InspectionDtos.InspectionAssetResponse::expiresAt)
                .filter(java.util.Objects::nonNull)
                .max(OffsetDateTime::compareTo)
                .orElse(null);

        String message = "Retrato NH - " + type
                + "\nAssociado: " + item.getAssociateName()
                + "\nConsultor: " + item.getConsultantName()
                + "\nPlaca: " + plateLabel
                + (item.getContractedPlan() == null ? "" : "\nPlano já contratado: " + item.getContractedPlan())
                + (availableCount == 0
                    ? "\nLink: " + publicUrl
                    : "\nArquivos disponíveis no painel de análise por 40 dias.");
        String subject = "Retrato NH - " + plateLabel;
        InspectionRequestStatus displayStatus;
        boolean preCompletion = item.getStatus() == InspectionRequestStatus.WAITING_FILES
                || item.getStatus() == InspectionRequestStatus.UPLOADING_FILES
                || item.getStatus() == InspectionRequestStatus.CREATED;
        if (availableCount == 0 && preCompletion) {
            displayStatus = InspectionRequestStatus.WAITING_FILES;
        } else if (availableCount > 0
                && (item.getStatus() == InspectionRequestStatus.WAITING_FILES
                    || item.getStatus() == InspectionRequestStatus.CREATED)) {
            displayStatus = InspectionRequestStatus.UPLOADING_FILES;
        } else {
            displayStatus = item.getStatus();
        }
        String associateInspectionUrl = associateInspectionWhatsappUrl(item, publicUrl);
        String consultantInspectionUrl = consultantInspectionWhatsappUrl(item, publicUrl);
        String associateDecisionUrl = associateDecisionWhatsappUrl(item);
        boolean decisionMessagePending = associateDecisionUrl != null && item.getDecisionMessageSentAt() == null;
        return new AdminInspectionResponse(
                item.getId(), item.getRequestType().name(), item.getVehicleType().name(), item.getAssociateName(),
                revealCpf ? formatCpf(item.getCpf()) : maskCpf(item.getCpf()),
                item.getWhatsapp(), item.getPlate(), item.getResidenceAddress(), item.getContractedPlan(),
                item.getQuotation() == null ? null : item.getQuotation().getBillingDueDay(),
                item.getQuotation() == null ? null : item.getQuotation().getFirstBillingDueDate(),
                item.getQuotation() == null ? 0 : item.getQuotation().getDiscountPercent(),
                item.getQuotation() == null ? RearWindowBranding.NOT_APPLICABLE : item.getQuotation().getRearWindowBranding(), null,
                item.getConsultant() == null ? null : item.getConsultant().getId(), item.getConsultantName(),
                item.getAssignedAnalyst() == null ? null : item.getAssignedAnalyst().getId(), item.getAssignedAnalystName(),
                item.getAnalysisStage(), item.getRegistrationCompletedAt(), item.getRegistrationCompletedByName(), displayStatus,
                item.getCreatedAt(), item.getExpiresAt(), item.getCompletedAt(), item.getAdminNote(), item.getReviewedAt(),
                item.getReviewedByCollaborator() == null ? null : item.getReviewedByCollaborator().getId(),
                item.getReviewedByName(), item.getReviewedByRole(),
                publicUrl, null, null, quotationPdfUrl, whatsappUrl(whatsapp, message), emailUrl(email, subject, message), associateInspectionUrl,
                consultantInspectionUrl, associateDecisionUrl, item.getDecisionMessageSentAt(), decisionMessagePending,
                availableCount, expiredCount, filesExpireAt, assets
        );
    }

    private String associateInspectionWhatsappUrl(InspectionRequest item, String publicUrl) {
        String phone = normalizeAssociatePhone(item.getWhatsapp());
        if (phone == null || publicUrl == null || publicUrl.isBlank()) return null;
        String firstName = item.getAssociateName() == null || item.getAssociateName().isBlank()
                ? "associado" : item.getAssociateName().trim().split("\\s+")[0];
        boolean hasPreservedFile = item.getAssets().stream()
                .filter(asset -> asset.getAssetType() != br.com.nh.cotacao.entity.InspectionAssetType.REPORT)
                .anyMatch(storageService::isAvailable);
        String message;
        if (hasPreservedFile && item.getCompletedAt() == null) {
            message = "Olá, " + firstName + "! Precisamos refazer apenas alguns arquivos da sua vistoria. "
                    + "Os arquivos já aceitos foram mantidos e não precisam ser enviados novamente. "
                    + "Ao abrir o link, o sistema mostrará somente o que está pendente/rejeitado:\n" + publicUrl;
        } else {
            String action = item.getRequestType() == InspectionRequestType.NEW_INSPECTION
                    ? "realizar a vistoria digital completa"
                    : "gravar o vídeo para atualização do boleto";
            message = "Olá, " + firstName + "! Acesse o link abaixo para " + action
                    + " do seu veículo pela Novo Horizonte Proteção Veicular:\n" + publicUrl;
        }
        return whatsappUrl(phone, message);
    }

    private String consultantInspectionWhatsappUrl(InspectionRequest item, String publicUrl) {
        if (item.getConsultant() == null || publicUrl == null || publicUrl.isBlank()) return null;
        String phone = normalizeAssociatePhone(item.getConsultant().getWhatsapp());
        if (phone == null) return null;
        String consultantFirstName = item.getConsultantName() == null || item.getConsultantName().isBlank()
                ? "consultor" : item.getConsultantName().trim().split("\\s+")[0];
        boolean pending = item.getAnalysisStage() == InspectionAnalysisStage.ANALYST_PENDING
                || item.getStatus() == InspectionRequestStatus.WAITING_FILES;
        String message = pending
                ? "Olá, " + consultantFirstName + "! A vistoria de " + item.getAssociateName()
                    + " possui arquivo(s) reprovado(s) ou pendente(s). Envie este link ao associado para refazer somente o que falta:\n" + publicUrl
                : "Olá, " + consultantFirstName + "! Segue o link da vistoria de " + item.getAssociateName() + ":\n" + publicUrl;
        return whatsappUrl(phone, message);
    }

    private String associateDecisionWhatsappUrl(InspectionRequest item) {
        if (item.getStatus() != InspectionRequestStatus.APPROVED
                && item.getStatus() != InspectionRequestStatus.REJECTED) return null;
        String phone = normalizeAssociatePhone(item.getWhatsapp());
        if (phone == null) return null;
        String firstName = item.getAssociateName() == null || item.getAssociateName().isBlank()
                ? "associado" : item.getAssociateName().trim().split("\\s+")[0];
        String message;
        if (item.getStatus() == InspectionRequestStatus.APPROVED) {
            message = "Olá, " + firstName + "! Sua vistoria foi aprovada pela equipe Novo Horizonte Proteção Veicular.";
        } else {
            message = "Olá, " + firstName + "! Sua vistoria foi recusada pela equipe Novo Horizonte Proteção Veicular."
                    + (item.getAdminNote() == null || item.getAdminNote().isBlank()
                    ? " Entre em contato com o seu consultor para receber as orientações."
                    : " Motivo/orientação: " + item.getAdminNote());
        }
        return whatsappUrl(phone, message);
    }

    private String normalizeAssociatePhone(String value) {
        if (value == null || value.isBlank()) return null;
        String digits = value.replaceAll("\\D", "");
        if (digits.length() == 10 || digits.length() == 11) digits = "55" + digits;
        return digits.matches("^[1-9][0-9]{11,14}$") ? digits : null;
    }

    private String quoteAnalysisSummary(Quotation item) {
        return "status=" + item.getStatus() + "; observação=" + value(item.getAdminNote());
    }

    private String inspectionAnalysisSummary(InspectionRequest item) {
        return "status=" + item.getStatus()
                + "; observação=" + value(item.getAdminNote())
                + "; responsável=" + value(item.getReviewedByName());
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
    private String formatCpf(String cpf) {
        if (cpf == null || cpf.isBlank()) return "—";
        String digits = cpf.replaceAll("\\D", "");
        return digits.length() == 11
                ? digits.substring(0, 3) + "." + digits.substring(3, 6) + "." + digits.substring(6, 9) + "-" + digits.substring(9)
                : cpf;
    }

    private String maskCpf(String cpf) {
        if (cpf == null || cpf.isBlank()) return "***.***.***-**";
        String digits = cpf.replaceAll("\\D", "");
        return digits.length() == 11
                ? "***." + digits.substring(3, 6) + "." + digits.substring(6, 9) + "-**"
                : "***.***.***-**";
    }
}
