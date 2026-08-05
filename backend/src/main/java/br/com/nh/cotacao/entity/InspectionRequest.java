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
            Consultant consultant
    ) {
        if (consultant == null) throw new IllegalArgumentException("Informe o consultor responsável.");
        return createBase(
                publicToken,
                type,
                associateName,
                cpf,
                whatsapp,
                plate,
                vehicleType == null ? InspectionVehicleType.FOUR_WHEELS_OR_MORE : vehicleType,
                consultant,
                consultant.getName(),
                null
        );
    }

    public static InspectionRequest createForSelfServiceQuote(String publicToken, Quotation quotation) {
        if (quotation == null || quotation.getOrigin() != QuoteOrigin.SELF_SERVICE) {
            throw new IllegalArgumentException("A vistoria automática exige uma cotação feita pelo cliente.");
        }
        if (quotation.getCustomerCpf() == null || quotation.getCustomerCpf().isBlank()) {
            throw new IllegalArgumentException("A cotação não possui CPF para gerar o link da vistoria.");
        }
        return createBase(
                publicToken,
                InspectionRequestType.NEW_INSPECTION,
                quotation.getCustomerName(),
                quotation.getCustomerCpf(),
                quotation.getWhatsapp(),
                quotation.getPlate(),
                InspectionVehicleType.fromCategoryCode(quotation.getCategoryCode()),
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
        request.consultant = consultant;
        request.consultantName = consultantName;
        request.quotation = quotation;
        request.status = InspectionRequestStatus.CREATED;
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
        return (status == InspectionRequestStatus.CREATED || status == InspectionRequestStatus.UNDER_REVIEW)
                && OffsetDateTime.now().isAfter(expiresAt);
    }

    public void registerFolder(String id, String url) {
        this.driveFolderId = id;
        this.driveFolderUrl = url;
    }

    public void addAsset(InspectionAsset asset) { assets.add(asset); }

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

    public void complete(String reportFileId, String reportUrl) {
        this.reportFileId = reportFileId;
        this.reportUrl = reportUrl;
        this.status = InspectionRequestStatus.COMPLETED;
        this.completedAt = OffsetDateTime.now();
        this.completionMessageSentAt = null;
    }

    public void adminReview(InspectionRequestStatus newStatus, String note) {
        if (newStatus == null) throw new IllegalArgumentException("Informe o novo status do Retrato NH.");
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
