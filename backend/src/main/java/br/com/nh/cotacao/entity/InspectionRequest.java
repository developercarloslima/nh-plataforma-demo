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

    @Column(name = "associate_name", nullable = false, length = 140)
    private String associateName;

    @Column(nullable = false, length = 14)
    private String cpf;

    @Column(length = 30)
    private String whatsapp;

    @Column(nullable = false, length = 10)
    private String plate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultant_id", nullable = false)
    private Consultant consultant;

    @Column(name = "consultant_name", nullable = false, length = 140)
    private String consultantName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private InspectionRequestStatus status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

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
            Consultant consultant
    ) {
        InspectionRequest request = new InspectionRequest();
        request.id = UUID.randomUUID();
        request.publicToken = publicToken;
        request.requestType = type;
        request.associateName = associateName.trim().replaceAll("\\s+", " ");
        request.cpf = cpf.replaceAll("\\D", "");
        request.whatsapp = whatsapp == null ? null : whatsapp.replaceAll("\\D", "");
        request.plate = plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        request.consultant = consultant;
        request.consultantName = consultant.getName();
        request.status = InspectionRequestStatus.CREATED;
        request.createdAt = OffsetDateTime.now();
        request.expiresAt = request.createdAt.plusDays(7);
        return request;
    }

    public boolean isExpired() {
        return status == InspectionRequestStatus.CREATED && OffsetDateTime.now().isAfter(expiresAt);
    }

    public void registerFolder(String id, String url) {
        this.driveFolderId = id;
        this.driveFolderUrl = url;
    }

    public void addAsset(InspectionAsset asset) { assets.add(asset); }

    public void complete(String reportFileId, String reportUrl) {
        this.reportFileId = reportFileId;
        this.reportUrl = reportUrl;
        this.status = InspectionRequestStatus.COMPLETED;
        this.completedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public String getPublicToken() { return publicToken; }
    public InspectionRequestType getRequestType() { return requestType; }
    public String getAssociateName() { return associateName; }
    public String getCpf() { return cpf; }
    public String getWhatsapp() { return whatsapp; }
    public String getPlate() { return plate; }
    public Consultant getConsultant() { return consultant; }
    public String getConsultantName() { return consultantName; }
    public InspectionRequestStatus getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public String getDriveFolderId() { return driveFolderId; }
    public String getDriveFolderUrl() { return driveFolderUrl; }
    public String getReportFileId() { return reportFileId; }
    public String getReportUrl() { return reportUrl; }
    public List<InspectionAsset> getAssets() { return assets; }
}
