package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "inspection_requests")
public class InspectionRequest {
    @Id
    private UUID id;

    @Column(name = "public_token", nullable = false, unique = true, length = 80)
    private String publicToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "request_type", nullable = false, length = 30)
    private InspectionRequestType requestType;

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false, length = 30)
    private InspectionVehicleType vehicleType;

    @Column(name = "associate_name", nullable = false, length = 140)
    private String associateName;

    @Column(nullable = false, length = 14)
    private String cpf;

    @Column(length = 30)
    private String whatsapp;

    @Column(length = 10)
    private String plate;

    @Column(name = "residence_address", length = 600)
    private String residenceAddress;

    @Column(name = "contracted_plan", length = 160)
    private String contractedPlan;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "consultant_id")
    private Consultant consultant;

    @Column(name = "consultant_name", nullable = false, length = 140)
    private String consultantName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_analyst_id")
    private Consultant assignedAnalyst;

    @Column(name = "assigned_analyst_name", length = 160)
    private String assignedAnalystName;

    @Enumerated(EnumType.STRING)
    @Column(name = "analysis_stage", nullable = false, length = 30)
    private InspectionAnalysisStage analysisStage;

    @Column(name = "registration_completed_at")
    private OffsetDateTime registrationCompletedAt;

    @Column(name = "registration_completed_by_name", length = 160)
    private String registrationCompletedByName;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quotation_id")
    private Quotation quotation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private InspectionRequestStatus status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "admin_note", length = 1200)
    private String adminNote;

    @Column(name = "supervision_note", length = 1200)
    private String supervisionNote;

    @Column(name = "supervision_note_updated_at")
    private OffsetDateTime supervisionNoteUpdatedAt;

    @Column(name = "supervision_note_by_name", length = 160)
    private String supervisionNoteByName;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by_collaborator_id")
    private Consultant reviewedByCollaborator;

    @Column(name = "reviewed_by_name", length = 160)
    private String reviewedByName;

    @Column(name = "reviewed_by_role", length = 20)
    private String reviewedByRole;

    @Column(name = "completion_message_sent_at")
    private OffsetDateTime completionMessageSentAt;

    @Column(name = "decision_message_sent_at")
    private OffsetDateTime decisionMessageSentAt;

    @Column(name = "drive_folder_id", length = 160)
    private String driveFolderId;

    @Column(name = "drive_folder_url", length = 500)
    private String driveFolderUrl;

    @Column(name = "report_file_id", length = 160)
    private String reportFileId;

    @Column(name = "report_url", length = 500)
    private String reportUrl;

    @Column(name = "webauthn_registration_challenge", length = 160)
    private String webauthnRegistrationChallenge;

    @Column(name = "webauthn_registration_expires_at")
    private OffsetDateTime webauthnRegistrationExpiresAt;

    @Column(name = "webauthn_origin", length = 320)
    private String webauthnOrigin;

    @Column(name = "webauthn_rp_id", length = 253)
    private String webauthnRpId;

    @Column(name = "webauthn_credential_id", length = 1024)
    private String webauthnCredentialId;

    @Column(name = "webauthn_public_key", columnDefinition = "bytea")
    private byte[] webauthnPublicKey;

    @Column(name = "webauthn_algorithm")
    private Integer webauthnAlgorithm;

    @Column(name = "webauthn_sign_count")
    private Long webauthnSignCount;

    @Column(name = "webauthn_assertion_challenge", length = 160)
    private String webauthnAssertionChallenge;

    @Column(name = "webauthn_assertion_expires_at")
    private OffsetDateTime webauthnAssertionExpiresAt;

    @Column(name = "acceptance_evidence_hash", length = 64)
    private String acceptanceEvidenceHash;

    @Column(name = "acceptance_selfie_sha256", length = 64)
    private String acceptanceSelfieSha256;

    @Column(name = "acceptance_dossier_sha256", length = 64)
    private String acceptanceDossierSha256;

    @Column(name = "acceptance_device_metadata", columnDefinition = "text")
    private String acceptanceDeviceMetadata;

    @Column(name = "acceptance_ip", length = 80)
    private String acceptanceIp;

    @Column(name = "acceptance_latitude")
    private Double acceptanceLatitude;

    @Column(name = "acceptance_longitude")
    private Double acceptanceLongitude;

    @Column(name = "acceptance_accuracy_meters")
    private Double acceptanceAccuracyMeters;

    @Column(name = "acceptance_assertion_signature", columnDefinition = "text")
    private String acceptanceAssertionSignature;

    @Column(name = "acceptance_authenticator_data", columnDefinition = "text")
    private String acceptanceAuthenticatorData;

    @Column(name = "acceptance_client_data_json", columnDefinition = "text")
    private String acceptanceClientDataJson;

    @Column(name = "acceptance_proof_hash", length = 64)
    private String acceptanceProofHash;

    @Column(name = "acceptance_user_verified")
    private Boolean acceptanceUserVerified;

    @Column(name = "accepted_at")
    private OffsetDateTime acceptedAt;

    @OneToMany(mappedBy = "inspectionRequest", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<InspectionAsset> assets = new ArrayList<>();

    protected InspectionRequest() {}

    public static InspectionRequest create(
            String publicToken,
            InspectionRequestType type,
            String associateName,
            String cpf,
            String whatsapp,
            String plate,
            InspectionVehicleType vehicleType,
            Consultant consultant,
            String contractedPlan
    ) {
        if (consultant == null) throw new IllegalArgumentException("Informe o consultor responsável.");
        if (type == InspectionRequestType.NEW_INSPECTION) {
            throw new IllegalArgumentException("Nova vistoria só pode ser criada a partir de uma cotação aceita.");
        }
        if (contractedPlan == null || contractedPlan.isBlank()) {
            throw new IllegalArgumentException("Informe o plano já contratado para a atualização de boleto.");
        }
        return createBase(
                publicToken,
                type,
                associateName,
                cpf,
                whatsapp,
                plate,
                vehicleType == null ? InspectionVehicleType.FOUR_WHEELS_OR_MORE : vehicleType,
                contractedPlan,
                consultant,
                consultant.getName(),
                null
        );
    }

    public static InspectionRequest createForSelfServiceQuote(String publicToken, Quotation quotation) {
        if (quotation == null || quotation.getOrigin() != QuoteOrigin.SELF_SERVICE) {
            throw new IllegalArgumentException("A vistoria automática exige uma cotação feita pelo cliente.");
        }
        return createForQuotation(publicToken, quotation);
    }

    public static InspectionRequest createForQuotation(String publicToken, Quotation quotation) {
        if (quotation == null || quotation.getStatus() != QuoteStatus.ACCEPTED) {
            throw new IllegalArgumentException("A cotação precisa estar aceita para iniciar a vistoria.");
        }
        if (quotation.getCustomerCpf() == null || quotation.getCustomerCpf().isBlank()) {
            throw new IllegalArgumentException("A cotação não possui CPF para gerar o link da vistoria.");
        }
        if (quotation.getConsultant() == null) {
            throw new IllegalArgumentException("A cotação não possui consultor responsável.");
        }
        return createBase(
                publicToken,
                InspectionRequestType.NEW_INSPECTION,
                quotation.getCustomerName(),
                quotation.getCustomerCpf(),
                quotation.getWhatsapp(),
                quotation.getPlate(),
                InspectionVehicleType.fromCategoryCode(quotation.getCategoryCode()),
                null,
                quotation.getConsultant(),
                quotation.getConsultantName(),
                quotation
        );
    }

    private static InspectionRequest createBase(
            String publicToken,
            InspectionRequestType type,
            String associateName,
            String cpf,
            String whatsapp,
            String plate,
            InspectionVehicleType vehicleType,
            String contractedPlan,
            Consultant consultant,
            String consultantName,
            Quotation quotation
    ) {
        InspectionRequest request = new InspectionRequest();
        request.id = UUID.randomUUID();
        request.publicToken = publicToken;
        request.requestType = type;
        request.vehicleType = vehicleType == null ? InspectionVehicleType.FOUR_WHEELS_OR_MORE : vehicleType;
        request.associateName = associateName.trim().replaceAll("\\s+", " ");
        request.cpf = cpf.replaceAll("\\D", "");
        request.whatsapp = whatsapp == null ? null : whatsapp.replaceAll("\\D", "");
        request.plate = normalizePlate(plate);
        request.contractedPlan = contractedPlan == null || contractedPlan.isBlank()
                ? null
                : contractedPlan.trim().replaceAll("\\s+", " ");
        request.consultant = consultant;
        request.consultantName = consultantName;
        request.quotation = quotation;
        request.analysisStage = InspectionAnalysisStage.ANALYST_QUEUE;
        if (consultant != null && consultant.getAssignedAnalyst() != null) {
            request.assignAnalyst(consultant.getAssignedAnalyst());
        }
        request.status = InspectionRequestStatus.WAITING_FILES;
        request.createdAt = OffsetDateTime.now();
        request.expiresAt = request.createdAt.plusDays(7);
        return request;
    }

    private static String normalizePlate(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    public boolean isExpired() {
        return (status == InspectionRequestStatus.WAITING_FILES
                || status == InspectionRequestStatus.UPLOADING_FILES
                || status == InspectionRequestStatus.CREATED
                || status == InspectionRequestStatus.UNDER_REVIEW)
                && OffsetDateTime.now().isAfter(expiresAt);
    }


    public void assignConsultant(Consultant consultant) {
        if (consultant == null) throw new IllegalArgumentException("Informe o consultor responsável.");
        this.consultant = consultant;
        this.consultantName = consultant.getName();
        if (consultant.getAssignedAnalyst() != null
                && this.analysisStage != InspectionAnalysisStage.FINISHED
                && this.analysisStage != InspectionAnalysisStage.SUPERVISION_QUEUE) {
            assignAnalyst(consultant.getAssignedAnalyst());
        }
    }

    public void assignAnalyst(Consultant analyst) {
        if (analyst == null) {
            this.assignedAnalyst = null;
            this.assignedAnalystName = null;
            return;
        }
        if (!analyst.isActive() || analyst.getRole() != CollaboratorRole.ANALYST) {
            throw new IllegalArgumentException("Selecione um analista ativo para esta vistoria.");
        }
        this.assignedAnalyst = analyst;
        this.assignedAnalystName = analyst.getName();
    }

    public void markRegistrationCompletedByAdministrator(String administratorName, String note) {
        assertStoredCompletionRequirements(true);
        String cleanAdministratorName = cleanReviewerName(administratorName);
        if (cleanAdministratorName == null) {
            throw new IllegalArgumentException("Informe o nome do administrador responsável.");
        }
        this.adminNote = cleanNote(note);
        this.registrationCompletedAt = OffsetDateTime.now();
        this.registrationCompletedByName = cleanAdministratorName;
        this.status = InspectionRequestStatus.UNDER_REVIEW;
        this.analysisStage = InspectionAnalysisStage.SUPERVISION_QUEUE;
        this.reviewedAt = this.registrationCompletedAt;
        this.reviewedByCollaborator = null;
        this.reviewedByName = cleanAdministratorName;
        this.reviewedByRole = "ADMIN_ANALYSIS";
        this.decisionMessageSentAt = null;
    }

    public void markRegistrationNotCompletedByAdministrator(String administratorName, String note) {
        assertStoredCompletionRequirements(true);
        String cleanAdministratorName = cleanReviewerName(administratorName);
        if (cleanAdministratorName == null) {
            throw new IllegalArgumentException("Informe o nome do administrador responsável.");
        }
        this.adminNote = cleanNote(note);
        this.registrationCompletedAt = null;
        this.registrationCompletedByName = null;
        this.status = InspectionRequestStatus.UNDER_REVIEW;
        this.analysisStage = InspectionAnalysisStage.ANALYST_QUEUE;
        this.reviewedAt = OffsetDateTime.now();
        this.reviewedByCollaborator = null;
        this.reviewedByName = cleanAdministratorName;
        this.reviewedByRole = "ADMIN_ANALYSIS";
        this.decisionMessageSentAt = null;
    }

    public void markRegistrationCompleted(Consultant analyst, String note) {
        if (analyst == null || analyst.getRole() != CollaboratorRole.ANALYST) {
            throw new IllegalArgumentException("Apenas um analista vinculado pode concluir o cadastro.");
        }
        if (assignedAnalyst != null && !assignedAnalyst.getId().equals(analyst.getId())) {
            throw new IllegalArgumentException("Esta vistoria está vinculada a outro analista.");
        }
        if (assignedAnalyst == null) assignAnalyst(analyst);
        assertStoredCompletionRequirements(true);
        this.adminNote = cleanNote(note);
        this.registrationCompletedAt = OffsetDateTime.now();
        this.registrationCompletedByName = analyst.getName();
        this.status = InspectionRequestStatus.UNDER_REVIEW;
        this.analysisStage = InspectionAnalysisStage.SUPERVISION_QUEUE;
        this.decisionMessageSentAt = null;
    }

    public void markRegistrationNotCompleted(Consultant analyst, String note) {
        if (analyst == null || analyst.getRole() != CollaboratorRole.ANALYST) {
            throw new IllegalArgumentException("Apenas um analista vinculado pode marcar Cadastro não feito.");
        }
        if (assignedAnalyst != null && !assignedAnalyst.getId().equals(analyst.getId())) {
            throw new IllegalArgumentException("Esta vistoria está vinculada a outro analista.");
        }
        if (assignedAnalyst == null) assignAnalyst(analyst);
        // Cadastro não feito só é uma situação de análise quando todos os documentos já chegaram.
        // Se houver qualquer pendência, a situação correta é Aguardando documentos.
        assertStoredCompletionRequirements(true);
        this.adminNote = cleanNote(note);
        this.registrationCompletedAt = null;
        this.registrationCompletedByName = null;
        this.status = InspectionRequestStatus.UNDER_REVIEW;
        this.analysisStage = InspectionAnalysisStage.ANALYST_QUEUE;
        this.reviewedAt = OffsetDateTime.now();
        this.reviewedByCollaborator = analyst;
        this.reviewedByName = analyst.getName();
        this.reviewedByRole = "ANALYST";
        this.decisionMessageSentAt = null;
    }

    public void routeBackToAnalystPending() {
        if (this.analysisStage != InspectionAnalysisStage.FINISHED) {
            this.analysisStage = InspectionAnalysisStage.ANALYST_PENDING;
        }
        this.registrationCompletedAt = null;
        this.registrationCompletedByName = null;
    }

    /** Sincroniza os dados cadastrais vindos da cotação sem alterar o conteúdo da vistoria. */
    public void updateAssociateData(String associateName, String cpf, String whatsapp, String plate) {
        if (associateName == null || associateName.isBlank()) {
            throw new IllegalArgumentException("Informe o nome do associado.");
        }
        String cleanName = associateName.trim().replaceAll("\\s+", " ");
        if (cleanName.length() > 140) {
            throw new IllegalArgumentException("O nome do associado deve possuir no máximo 140 caracteres.");
        }
        String cpfDigits = cpf == null ? "" : cpf.replaceAll("\\D", "");
        if (cpfDigits.length() != 11) {
            throw new IllegalArgumentException("Informe um CPF válido antes de atualizar a vistoria.");
        }
        String phoneDigits = whatsapp == null ? "" : whatsapp.replaceAll("\\D", "");
        if (!phoneDigits.isBlank() && (phoneDigits.length() < 10 || phoneDigits.length() > 13)) {
            throw new IllegalArgumentException("Informe um WhatsApp válido com DDD.");
        }
        this.associateName = cleanName;
        this.cpf = cpfDigits;
        this.whatsapp = phoneDigits.isBlank() ? null : phoneDigits;
        this.plate = normalizePlate(plate);
    }

    public void registerFolder(String id, String url) {
        this.driveFolderId = id;
        this.driveFolderUrl = url;
    }

    public void addAsset(InspectionAsset asset) {
        if (asset == null) throw new IllegalArgumentException("Informe o arquivo da vistoria.");
        assets.add(asset);
        markUploadStarted();
    }

    public void removeAsset(InspectionAsset asset) {
        if (asset != null) assets.remove(asset);
    }

    public void markUploadStarted() {
        if (status == InspectionRequestStatus.WAITING_FILES
                || status == InspectionRequestStatus.CREATED) {
            status = InspectionRequestStatus.UPLOADING_FILES;
        }
    }

    /**
     * Reabre a vistoria quando um arquivo enviado é rejeitado/excluído na análise.
     * Os demais arquivos válidos permanecem associados à vistoria e o mesmo link
     * público volta a aceitar somente os slots que estiverem faltando.
     */
    public void reopenForMissingFiles() {
        this.status = InspectionRequestStatus.WAITING_FILES;
        if (this.assignedAnalyst != null) {
            this.analysisStage = InspectionAnalysisStage.ANALYST_PENDING;
        } else {
            this.analysisStage = InspectionAnalysisStage.ANALYST_QUEUE;
        }
        this.registrationCompletedAt = null;
        this.registrationCompletedByName = null;
        this.completedAt = null;
        this.completionMessageSentAt = null;
        this.decisionMessageSentAt = null;
        this.driveFolderId = null;
        this.driveFolderUrl = null;
        this.reportFileId = null;
        this.reportUrl = null;
        this.expiresAt = OffsetDateTime.now().plusDays(7);
    }

    public void registerResidenceAddress(String address) {
        if (requestType != InspectionRequestType.NEW_INSPECTION) {
            this.residenceAddress = null;
            return;
        }
        if (address == null || address.isBlank()) {
            throw new IllegalArgumentException("Informe o endereço de residência para concluir o cadastro.");
        }
        String clean = address.trim().replaceAll("\\s+", " ");
        if (clean.length() > 600) {
            throw new IllegalArgumentException("O endereço de residência deve possuir no máximo 600 caracteres.");
        }
        this.residenceAddress = clean;
    }

    public void complete() {
        assertStoredCompletionRequirements(true);
        this.reportFileId = null;
        this.reportUrl = null;
        this.driveFolderId = null;
        this.driveFolderUrl = null;
        this.status = InspectionRequestStatus.COMPLETED;
        if (this.analysisStage == null) this.analysisStage = InspectionAnalysisStage.ANALYST_QUEUE;
        this.completedAt = OffsetDateTime.now();
        this.completionMessageSentAt = null;
    }

    public void adminReview(InspectionRequestStatus newStatus, String note) {
        adminReview(newStatus, note, null, null, null, false);
    }

    public void adminReview(
            InspectionRequestStatus newStatus,
            String note,
            Consultant reviewerCollaborator,
            String reviewerName,
            String reviewerRole
    ) {
        adminReview(newStatus, note, reviewerCollaborator, reviewerName, reviewerRole, false);
    }

    public void adminReview(
            InspectionRequestStatus newStatus,
            String note,
            Consultant reviewerCollaborator,
            String reviewerName,
            String reviewerRole,
            boolean bypassCompletionRequirements
    ) {
        if (newStatus == null) throw new IllegalArgumentException("Informe o novo status do Retrato NH.");
        if (!bypassCompletionRequirements) {
            if (assets.isEmpty()
                    && newStatus != InspectionRequestStatus.WAITING_FILES
                    && newStatus != InspectionRequestStatus.CANCELLED
                    && newStatus != InspectionRequestStatus.EXPIRED) {
                throw new IllegalArgumentException("Esta vistoria ainda não possui arquivos. Mantenha o status Aguardando arquivos.");
            }
            if (newStatus == InspectionRequestStatus.UNDER_REVIEW
                    || newStatus == InspectionRequestStatus.COMPLETED
                    || newStatus == InspectionRequestStatus.APPROVED
                    || newStatus == InspectionRequestStatus.REJECTED) {
                assertStoredCompletionRequirements(true);
            }
        }
        InspectionRequestStatus previousStatus = this.status;
        this.status = newStatus;
        if (previousStatus != newStatus) {
            this.decisionMessageSentAt = null;
        }
        this.adminNote = cleanNote(note);
        this.reviewedAt = OffsetDateTime.now();
        this.reviewedByCollaborator = reviewerCollaborator;
        this.reviewedByName = cleanReviewerName(reviewerName);
        this.reviewedByRole = reviewerRole == null || reviewerRole.isBlank() ? null : reviewerRole.trim();
        if (newStatus == InspectionRequestStatus.APPROVED
                || newStatus == InspectionRequestStatus.REJECTED
                || newStatus == InspectionRequestStatus.CANCELLED
                || newStatus == InspectionRequestStatus.EXPIRED) {
            this.analysisStage = InspectionAnalysisStage.FINISHED;
        }
        if (newStatus == InspectionRequestStatus.COMPLETED
                || newStatus == InspectionRequestStatus.APPROVED
                || newStatus == InspectionRequestStatus.REJECTED
                || newStatus == InspectionRequestStatus.CANCELLED) {
            if (this.completedAt == null && newStatus != InspectionRequestStatus.CANCELLED) {
                this.completedAt = this.reviewedAt;
            }
        }
    }


    private void assertStoredCompletionRequirements(boolean requireReport) {
        if (requestType == InspectionRequestType.NEW_INSPECTION) {
            long photoCount = assets.stream()
                    .filter(asset -> asset.getAssetType() == InspectionAssetType.PHOTO)
                    .filter(InspectionAsset::isAvailable)
                    .count();
            if (photoCount < vehicleType.requiredPhotoCount()) {
                throw new IllegalArgumentException("Ainda faltam fotos obrigatórias da vistoria.");
            }
            requireAsset(InspectionAssetType.SIGNATURE, "a assinatura do associado");
            requireAsset(InspectionAssetType.VEHICLE_DOCUMENT, "o CRLV do veículo");
            long identityDocumentCount = assets.stream()
                    .filter(asset -> asset.getAssetType() == InspectionAssetType.IDENTITY_DOCUMENT)
                    .filter(InspectionAsset::isAvailable)
                    .count();
            if (identityDocumentCount < 2) {
                throw new IllegalArgumentException("Ainda falta enviar a frente e o verso do RG ou da CNH do associado.");
            }
        }
        requireAsset(InspectionAssetType.VIDEO, "o vídeo da vistoria");
        if (requireReport) {
            requireAsset(InspectionAssetType.REPORT, "o relatório da vistoria");
        }
    }

    private void requireAsset(InspectionAssetType type, String label) {
        boolean present = assets.stream()
                .anyMatch(asset -> asset.getAssetType() == type && asset.isAvailable());
        if (!present) {
            throw new IllegalArgumentException("Ainda falta enviar " + label + ".");
        }
    }

    public void markCompletionMessageSent() {
        if (this.completedAt == null) {
            throw new IllegalArgumentException("A vistoria ainda não foi concluída.");
        }
        this.completionMessageSentAt = OffsetDateTime.now();
    }

    public void markDecisionMessageSent() {
        if (this.status != InspectionRequestStatus.APPROVED
                && this.status != InspectionRequestStatus.REJECTED) {
            throw new IllegalArgumentException("A vistoria precisa estar aprovada ou recusada para comunicar a decisão.");
        }
        this.decisionMessageSentAt = OffsetDateTime.now();
    }

    public void beginWebAuthnRegistration(
            String challenge, OffsetDateTime expiresAt, String origin, String rpId,
            String evidenceHash, String selfieSha256, String dossierSha256,
            String deviceMetadata, String ip, Double latitude, Double longitude, Double accuracyMeters
    ) {
        this.webauthnRegistrationChallenge = challenge;
        this.webauthnRegistrationExpiresAt = expiresAt;
        this.webauthnOrigin = origin;
        this.webauthnRpId = rpId;
        this.acceptanceEvidenceHash = evidenceHash;
        this.acceptanceSelfieSha256 = selfieSha256;
        this.acceptanceDossierSha256 = dossierSha256;
        this.acceptanceDeviceMetadata = deviceMetadata;
        this.acceptanceIp = ip;
        this.acceptanceLatitude = latitude;
        this.acceptanceLongitude = longitude;
        this.acceptanceAccuracyMeters = accuracyMeters;
        this.webauthnAssertionChallenge = null;
        this.webauthnAssertionExpiresAt = null;
    }

    public void registerWebAuthnCredential(String credentialId, byte[] publicKey, int algorithm, long signCount) {
        this.webauthnCredentialId = credentialId;
        this.webauthnPublicKey = publicKey == null ? null : publicKey.clone();
        this.webauthnAlgorithm = algorithm;
        this.webauthnSignCount = signCount;
        this.webauthnRegistrationChallenge = null;
        this.webauthnRegistrationExpiresAt = null;
    }

    public void beginWebAuthnAssertion(String challenge, OffsetDateTime expiresAt) {
        this.webauthnAssertionChallenge = challenge;
        this.webauthnAssertionExpiresAt = expiresAt;
    }

    public void completeDigitalAcceptance(
            long signCount, String assertionSignature, String authenticatorData,
            String clientDataJson, String proofHash, boolean userVerified, OffsetDateTime acceptedAt
    ) {
        this.webauthnSignCount = signCount;
        this.acceptanceAssertionSignature = assertionSignature;
        this.acceptanceAuthenticatorData = authenticatorData;
        this.acceptanceClientDataJson = clientDataJson;
        this.acceptanceProofHash = proofHash;
        this.acceptanceUserVerified = userVerified;
        this.acceptedAt = acceptedAt;
        // Mantemos o challenge assinado para auditoria da prova WebAuthn.
    }

    public void updateSupervisionNote(String note, String supervisorName) {
        this.supervisionNote = cleanNote(note);
        this.supervisionNoteUpdatedAt = OffsetDateTime.now();
        this.supervisionNoteByName = cleanReviewerName(supervisorName);
    }

    private String cleanReviewerName(String value) {
        if (value == null || value.isBlank()) return null;
        String clean = value.trim().replaceAll("\\s+", " ");
        if (clean.length() > 160) clean = clean.substring(0, 160);
        return clean;
    }

    private String cleanNote(String note) {
        if (note == null || note.isBlank()) return null;
        String clean = note.trim();
        if (clean.length() > 1200) throw new IllegalArgumentException("A observação deve possuir no máximo 1.200 caracteres.");
        return clean;
    }

    public UUID getId() { return id; }
    public String getPublicToken() { return publicToken; }
    public InspectionRequestType getRequestType() { return requestType; }
    public InspectionVehicleType getVehicleType() { return vehicleType; }
    public String getAssociateName() { return associateName; }
    public String getCpf() { return cpf; }
    public String getWhatsapp() { return whatsapp; }
    public String getPlate() { return plate; }
    public String getResidenceAddress() { return residenceAddress; }
    public String getContractedPlan() { return contractedPlan; }
    public Consultant getConsultant() { return consultant; }
    public String getConsultantName() { return consultantName; }
    public Consultant getAssignedAnalyst() { return assignedAnalyst; }
    public String getAssignedAnalystName() { return assignedAnalystName; }
    public InspectionAnalysisStage getAnalysisStage() { return analysisStage; }
    public OffsetDateTime getRegistrationCompletedAt() { return registrationCompletedAt; }
    public String getRegistrationCompletedByName() { return registrationCompletedByName; }
    public Quotation getQuotation() { return quotation; }
    public InspectionRequestStatus getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public String getAdminNote() { return adminNote; }
    public String getSupervisionNote() { return supervisionNote; }
    public OffsetDateTime getSupervisionNoteUpdatedAt() { return supervisionNoteUpdatedAt; }
    public String getSupervisionNoteByName() { return supervisionNoteByName; }
    public OffsetDateTime getReviewedAt() { return reviewedAt; }
    public Consultant getReviewedByCollaborator() { return reviewedByCollaborator; }
    public String getReviewedByName() { return reviewedByName; }
    public String getReviewedByRole() { return reviewedByRole; }
    public OffsetDateTime getCompletionMessageSentAt() { return completionMessageSentAt; }
    public OffsetDateTime getDecisionMessageSentAt() { return decisionMessageSentAt; }
    public String getDriveFolderId() { return driveFolderId; }
    public String getDriveFolderUrl() { return driveFolderUrl; }
    public String getReportFileId() { return reportFileId; }
    public String getReportUrl() { return reportUrl; }
    public String getWebauthnRegistrationChallenge() { return webauthnRegistrationChallenge; }
    public OffsetDateTime getWebauthnRegistrationExpiresAt() { return webauthnRegistrationExpiresAt; }
    public String getWebauthnOrigin() { return webauthnOrigin; }
    public String getWebauthnRpId() { return webauthnRpId; }
    public String getWebauthnCredentialId() { return webauthnCredentialId; }
    public byte[] getWebauthnPublicKey() { return webauthnPublicKey == null ? null : webauthnPublicKey.clone(); }
    public Integer getWebauthnAlgorithm() { return webauthnAlgorithm; }
    public long getWebauthnSignCount() { return webauthnSignCount == null ? 0L : webauthnSignCount; }
    public String getWebauthnAssertionChallenge() { return webauthnAssertionChallenge; }
    public OffsetDateTime getWebauthnAssertionExpiresAt() { return webauthnAssertionExpiresAt; }
    public String getAcceptanceEvidenceHash() { return acceptanceEvidenceHash; }
    public String getAcceptanceSelfieSha256() { return acceptanceSelfieSha256; }
    public String getAcceptanceDossierSha256() { return acceptanceDossierSha256; }
    public String getAcceptanceDeviceMetadata() { return acceptanceDeviceMetadata; }
    public String getAcceptanceIp() { return acceptanceIp; }
    public Double getAcceptanceLatitude() { return acceptanceLatitude; }
    public Double getAcceptanceLongitude() { return acceptanceLongitude; }
    public Double getAcceptanceAccuracyMeters() { return acceptanceAccuracyMeters; }
    public String getAcceptanceAssertionSignature() { return acceptanceAssertionSignature; }
    public String getAcceptanceAuthenticatorData() { return acceptanceAuthenticatorData; }
    public String getAcceptanceClientDataJson() { return acceptanceClientDataJson; }
    public String getAcceptanceProofHash() { return acceptanceProofHash; }
    public boolean isAcceptanceUserVerified() { return Boolean.TRUE.equals(acceptanceUserVerified); }
    public OffsetDateTime getAcceptedAt() { return acceptedAt; }
    public List<InspectionAsset> getAssets() { return assets; }
}
