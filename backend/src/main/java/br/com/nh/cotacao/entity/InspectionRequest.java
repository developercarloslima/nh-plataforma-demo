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

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

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
        if (OffsetDateTime.now().isAfter(quotation.getValidUntil())) {
            throw new IllegalArgumentException("Esta cotação expirou e não pode mais iniciar uma nova vistoria.");
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
        this.completedAt = OffsetDateTime.now();
        this.completionMessageSentAt = null;
    }

    public void adminReview(InspectionRequestStatus newStatus, String note) {
        if (newStatus == null) throw new IllegalArgumentException("Informe o novo status do Retrato NH.");
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
        InspectionRequestStatus previousStatus = this.status;
        this.status = newStatus;
        if (previousStatus != newStatus) {
            this.decisionMessageSentAt = null;
        }
        this.adminNote = cleanNote(note);
        this.reviewedAt = OffsetDateTime.now();
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
    public Quotation getQuotation() { return quotation; }
    public InspectionRequestStatus getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public String getAdminNote() { return adminNote; }
    public OffsetDateTime getReviewedAt() { return reviewedAt; }
    public OffsetDateTime getCompletionMessageSentAt() { return completionMessageSentAt; }
    public OffsetDateTime getDecisionMessageSentAt() { return decisionMessageSentAt; }
    public String getDriveFolderId() { return driveFolderId; }
    public String getDriveFolderUrl() { return driveFolderUrl; }
    public String getReportFileId() { return reportFileId; }
    public String getReportUrl() { return reportUrl; }
    public List<InspectionAsset> getAssets() { return assets; }
}
