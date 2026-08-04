package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "quotations")
public class Quotation {
    @Id
    private UUID id;

    @Column(name = "quote_number", nullable = false, unique = true, length = 30)
    private String quoteNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "consultant_id")
    private Consultant consultant;

    @Column(name = "consultant_name", nullable = false, length = 140)
    private String consultantName;

    @Column(name = "customer_name", nullable = false, length = 120)
    private String customerName;

    @Column(length = 30)
    private String whatsapp;

    @Column(nullable = false, length = 10)
    private String plate;

    @Column(nullable = false, length = 120)
    private String model;

    @Column(name = "manufacture_year", nullable = false)
    private Integer manufactureYear;

    @Column(name = "zero_km", nullable = false)
    private boolean zeroKm;

    @Column(name = "fipe_value", nullable = false, precision = 14, scale = 2)
    private BigDecimal fipeValue;

    @Column(name = "category_code", nullable = false, length = 50)
    private String categoryCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Region region;

    @Column(name = "selected_plan_code", nullable = false, length = 80)
    private String selectedPlanCode;

    @Column(name = "selected_plan_name", nullable = false, length = 120)
    private String selectedPlanName;

    @Column(name = "base_monthly_value", nullable = false, precision = 14, scale = 2)
    private BigDecimal baseMonthlyValue;

    @Column(name = "monthly_value", nullable = false, precision = 14, scale = 2)
    private BigDecimal monthlyValue;

    @Column(name = "mandatory_monthly_fee", nullable = false, precision = 14, scale = 2)
    private BigDecimal mandatoryMonthlyFee;

    @Column(name = "one_time_fee", nullable = false, precision = 14, scale = 2)
    private BigDecimal oneTimeFee;

    @Column(name = "mandatory_fee_description", length = 240)
    private String mandatoryFeeDescription;

    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<QuotationOptionalCoverage> selectedOptionals = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QuoteStatus status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "valid_until", nullable = false)
    private OffsetDateTime validUntil;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "drive_folder_id", length = 160)
    private String driveFolderId;

    @Column(name = "drive_folder_url", length = 500)
    private String driveFolderUrl;

    @Column(name = "drive_pdf_file_id", length = 160)
    private String drivePdfFileId;

    @Column(name = "drive_pdf_url", length = 500)
    private String drivePdfUrl;

    @Column(name = "inspection_completed_at")
    private OffsetDateTime inspectionCompletedAt;

    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private Set<InspectionPhoto> inspectionPhotos = new LinkedHashSet<>();

    protected Quotation() {
    }

    public static Quotation create(
            String quoteNumber,
            Consultant consultant,
            String customerName,
            String whatsapp,
            String plate,
            String model,
            Integer manufactureYear,
            boolean zeroKm,
            BigDecimal fipeValue,
            String categoryCode,
            Region region,
            String selectedPlanCode,
            String selectedPlanName,
            BigDecimal baseMonthlyValue,
            BigDecimal mandatoryMonthlyFee,
            BigDecimal oneTimeFee,
            String mandatoryFeeDescription
    ) {
        Quotation q = new Quotation();
        q.id = UUID.randomUUID();
        q.quoteNumber = quoteNumber;
        q.consultant = consultant;
        q.consultantName = consultant.getName();
        q.customerName = customerName;
        q.whatsapp = whatsapp;
        q.plate = plate.toUpperCase();
        q.model = model;
        q.manufactureYear = manufactureYear;
        q.zeroKm = zeroKm;
        q.fipeValue = fipeValue;
        q.categoryCode = categoryCode;
        q.region = region;
        q.selectedPlanCode = selectedPlanCode;
        q.selectedPlanName = selectedPlanName;
        q.baseMonthlyValue = baseMonthlyValue;
        q.mandatoryMonthlyFee = mandatoryMonthlyFee == null ? BigDecimal.ZERO : mandatoryMonthlyFee;
        q.oneTimeFee = oneTimeFee == null ? BigDecimal.ZERO : oneTimeFee;
        q.mandatoryFeeDescription = mandatoryFeeDescription;
        q.monthlyValue = baseMonthlyValue.add(q.mandatoryMonthlyFee);
        q.status = QuoteStatus.CREATED;
        q.createdAt = OffsetDateTime.now();
        q.validUntil = q.createdAt.plusDays(5);
        return q;
    }

    public void addOptional(
            String coverageCode,
            String coverageName,
            String detail,
            BigDecimal monthlyPrice
    ) {
        if (monthlyPrice == null || monthlyPrice.signum() < 0) {
            throw new IllegalArgumentException("O opcional precisa possuir um valor mensal válido.");
        }
        boolean duplicate = selectedOptionals.stream()
                .anyMatch(item -> item.getCoverageCode().equals(coverageCode));
        if (duplicate) {
            throw new IllegalArgumentException("O mesmo opcional não pode ser selecionado mais de uma vez.");
        }
        selectedOptionals.add(QuotationOptionalCoverage.create(
                this,
                coverageCode,
                coverageName,
                detail,
                monthlyPrice
        ));
        monthlyValue = monthlyValue.add(monthlyPrice);
    }

    public void registerDriveFolder(String folderId, String folderUrl) {
        this.driveFolderId = folderId;
        this.driveFolderUrl = folderUrl;
    }

    public void replaceInspectionPhotos() {
        inspectionPhotos.clear();
        inspectionCompletedAt = null;
    }

    public void addInspectionPhoto(
            String label,
            String fileName,
            String contentType,
            long fileSize,
            int sortOrder,
            String driveFileId,
            String driveFileUrl
    ) {
        inspectionPhotos.add(InspectionPhoto.create(
                this,
                label,
                fileName,
                contentType,
                fileSize,
                sortOrder,
                driveFileId,
                driveFileUrl
        ));
    }

    public void completeInspection(String pdfFileId, String pdfUrl) {
        this.drivePdfFileId = pdfFileId;
        this.drivePdfUrl = pdfUrl;
        this.inspectionCompletedAt = OffsetDateTime.now();
    }

    public void decide(QuoteStatus newStatus) {
        if (newStatus != QuoteStatus.ACCEPTED && newStatus != QuoteStatus.DECLINED) {
            throw new IllegalArgumentException("A decisão deve ser ACCEPTED ou DECLINED.");
        }
        this.status = newStatus;
        this.decidedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public String getQuoteNumber() { return quoteNumber; }
    public Consultant getConsultant() { return consultant; }
    public String getConsultantName() { return consultantName; }
    public String getCustomerName() { return customerName; }
    public String getWhatsapp() { return whatsapp; }
    public String getPlate() { return plate; }
    public String getModel() { return model; }
    public Integer getManufactureYear() { return manufactureYear; }
    public boolean isZeroKm() { return zeroKm; }
    public BigDecimal getFipeValue() { return fipeValue; }
    public String getCategoryCode() { return categoryCode; }
    public Region getRegion() { return region; }
    public String getSelectedPlanCode() { return selectedPlanCode; }
    public String getSelectedPlanName() { return selectedPlanName; }
    public BigDecimal getBaseMonthlyValue() { return baseMonthlyValue; }
    public BigDecimal getMonthlyValue() { return monthlyValue; }
    public BigDecimal getMandatoryMonthlyFee() { return mandatoryMonthlyFee; }
    public BigDecimal getOneTimeFee() { return oneTimeFee; }
    public String getMandatoryFeeDescription() { return mandatoryFeeDescription; }
    public List<QuotationOptionalCoverage> getSelectedOptionals() { return selectedOptionals; }
    public QuoteStatus getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getValidUntil() { return validUntil; }
    public OffsetDateTime getDecidedAt() { return decidedAt; }
    public String getDriveFolderId() { return driveFolderId; }
    public String getDriveFolderUrl() { return driveFolderUrl; }
    public String getDrivePdfFileId() { return drivePdfFileId; }
    public String getDrivePdfUrl() { return drivePdfUrl; }
    public OffsetDateTime getInspectionCompletedAt() { return inspectionCompletedAt; }
    public Set<InspectionPhoto> getInspectionPhotos() { return inspectionPhotos; }
}
