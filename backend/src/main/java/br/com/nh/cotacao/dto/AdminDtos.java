package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.MotorcycleOrigin;
import br.com.nh.cotacao.entity.QuoteOrigin;
import br.com.nh.cotacao.entity.QuoteStatus;
import br.com.nh.cotacao.entity.Region;
import br.com.nh.cotacao.entity.RearWindowBranding;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class AdminDtos {
    private AdminDtos() {}

    public record CategoryResponse(Long id, String code, String name, boolean active) {}

    public record UpdateCategoryStatusRequest(@NotNull Boolean active) {}

    public record PriceRangeResponse(
            Long id,
            Long planId,
            String planName,
            String category,
            String region,
            MotorcycleOrigin motorcycleOrigin,
            BigDecimal minValue,
            BigDecimal maxValue,
            BigDecimal monthlyPrice
    ) {}

    public record OptionalPriceResponse(
            Long id,
            Long planId,
            String planName,
            String coverageName,
            String detail,
            BigDecimal monthlyPrice
    ) {}

    public record PromotionalMotorcyclePriceResponse(
            Long id,
            String tierCode,
            String label,
            Integer minCc,
            Integer maxCc,
            BigDecimal minFipe,
            BigDecimal maxFipe,
            BigDecimal monthlyPrice
    ) {}

    public record PlanAdminResponse(
            Long id,
            String name,
            String subtitle,
            Long categoryId,
            String category,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            Integer displayOrder,
            boolean active,
            BigDecimal extraAbove,
            BigDecimal extraStep,
            BigDecimal extraIncrement,
            BigDecimal extraBasePrice,
            BigDecimal trackerRequiredAbove,
            BigDecimal trackerInstallationFee,
            BigDecimal trackerMonthlyFee
    ) {}

    public record CreatePlanRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 180) String subtitle,
            @NotNull Long categoryId,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            @NotNull @Min(0) Integer displayOrder,
            @NotNull Boolean active,
            @DecimalMin("0.00") BigDecimal extraAbove,
            @DecimalMin(value = "0.01") BigDecimal extraStep,
            @DecimalMin("0.00") BigDecimal extraIncrement,
            @DecimalMin("0.00") BigDecimal extraBasePrice,
            @DecimalMin("0.00") BigDecimal trackerRequiredAbove,
            @DecimalMin("0.00") BigDecimal trackerInstallationFee,
            @DecimalMin("0.00") BigDecimal trackerMonthlyFee
    ) {}

    public record UpdatePlanRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 180) String subtitle,
            @NotNull Long categoryId,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            @NotNull @Min(0) Integer displayOrder,
            @NotNull Boolean active,
            @DecimalMin("0.00") BigDecimal extraAbove,
            @DecimalMin(value = "0.01") BigDecimal extraStep,
            @DecimalMin("0.00") BigDecimal extraIncrement,
            @DecimalMin("0.00") BigDecimal extraBasePrice,
            @DecimalMin("0.00") BigDecimal trackerRequiredAbove,
            @DecimalMin("0.00") BigDecimal trackerInstallationFee,
            @DecimalMin("0.00") BigDecimal trackerMonthlyFee
    ) {}

    public record CoverageAdminResponse(
            Long id,
            Long planId,
            String planName,
            String category,
            String region,
            MotorcycleOrigin motorcycleOrigin,
            String coverageName,
            CoverageStatus status,
            String detail,
            BigDecimal monthlyPrice,
            Integer sortOrder
    ) {}

    public record CreateCoverageRequest(
            @NotBlank @Size(max = 180) String coverageName,
            @NotNull CoverageStatus status,
            @Size(max = 240) String detail,
            @DecimalMin("0.00") BigDecimal monthlyPrice,
            @NotNull @Min(0) Integer sortOrder
    ) {}

    public record UpdateCoverageRequest(
            @NotNull Long planId,
            @NotBlank @Size(max = 180) String coverageName,
            @NotNull CoverageStatus status,
            @Size(max = 240) String detail,
            @DecimalMin("0.00") BigDecimal monthlyPrice,
            @NotNull @Min(0) Integer sortOrder
    ) {}

    public record CreatePriceRangeRequest(
            @NotNull Long planId,
            @NotNull @DecimalMin("0.00") BigDecimal minValue,
            @NotNull @DecimalMin("0.00") BigDecimal maxValue,
            @NotNull @DecimalMin("0.00") BigDecimal monthlyPrice
    ) {}

    public record UpdatePriceRangeRequest(
            @NotNull @DecimalMin("0.00") BigDecimal minValue,
            @NotNull @DecimalMin("0.00") BigDecimal maxValue,
            @NotNull @DecimalMin("0.00") BigDecimal monthlyPrice
    ) {}

    public record UpdatePriceRequest(@NotNull @DecimalMin("0.00") BigDecimal monthlyPrice) {}

    public record UpdatePromotionalMotorcyclePriceRequest(
            @NotBlank @Size(max = 120) String label,
            @NotNull @Min(1) @Max(2500) Integer minCc,
            @NotNull @Min(1) @Max(2500) Integer maxCc,
            @NotNull @DecimalMin("0.00") BigDecimal minFipe,
            @DecimalMin("0.00") BigDecimal maxFipe,
            @NotNull @DecimalMin("0.00") BigDecimal monthlyPrice
    ) {}

    public record UpdateQuoteStatusRequest(
            @NotNull QuoteStatus status,
            @Size(max = 1200) String adminNote
    ) {}

    public record UpdateQuoteConsultantRequest(@NotNull UUID consultantId) {}

    public record UpdatePublicQuoteAssignmentSettingsRequest(@NotNull Boolean enabled) {}

    public record PublicQuoteAssignmentSettingsResponse(
            boolean enabled,
            String updatedBy,
            OffsetDateTime updatedAt
    ) {}

    public record UpdateInspectionStatusRequest(
            @NotNull InspectionRequestStatus status,
            @Size(max = 1200) String adminNote
    ) {}

    public record AdminQuoteResponse(
            UUID id,
            String quoteNumber,
            QuoteOrigin origin,
            UUID consultantId,
            String consultantName,
            String customerName,
            String maskedCpf,
            String whatsapp,
            String plate,
            String model,
            Integer manufactureYear,
            boolean zeroKm,
            BigDecimal fipeValue,
            String categoryCode,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            Integer motorcycleCc,
            String observation,
            String selectedPlanName,
            BigDecimal preDiscountMonthlyValue,
            Integer discountPercent,
            RearWindowBranding rearWindowBranding,
            BigDecimal monthlyValue,
            BigDecimal oneTimeFee,
            QuoteStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime validUntil,
            boolean expired,
            OffsetDateTime decidedAt,
            String adminNote,
            OffsetDateTime reviewedAt,
            String pdfUrl,
            String driveFolderUrl,
            String drivePdfUrl,
            String inspectionUrl,
            String teamWhatsappUrl,
            String teamEmailUrl
    ) {}

    public record AdminInspectionResponse(
            UUID id,
            String requestType,
            String vehicleType,
            String associateName,
            String maskedCpf,
            String whatsapp,
            String plate,
            String residenceAddress,
            String contractedPlan,
            Integer billingDueDay,
            LocalDate firstBillingDueDate,
            Integer discountPercent,
            RearWindowBranding rearWindowBranding,
            String signatureUrl,
            UUID consultantId,
            String consultantName,
            InspectionRequestStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            OffsetDateTime completedAt,
            String adminNote,
            OffsetDateTime reviewedAt,
            String publicUrl,
            String driveFolderUrl,
            String reportUrl,
            String quotationPdfUrl,
            String teamWhatsappUrl,
            String teamEmailUrl,
            String associateInspectionWhatsappUrl,
            String associateDecisionWhatsappUrl,
            OffsetDateTime decisionMessageSentAt,
            boolean associateDecisionMessagePending,
            int assetCount,
            int expiredAssetCount,
            OffsetDateTime filesExpireAt,
            List<InspectionDtos.InspectionAssetResponse> assets
    ) {}

    public record CommunicationSettingsResponse(
            String teamEmail,
            String teamWhatsapp,
            String updatedBy,
            OffsetDateTime updatedAt
    ) {}

    public record UpdateCommunicationSettingsRequest(
            @Email @Size(max = 180) String teamEmail,
            @Pattern(regexp = "^$|^[0-9]{10,15}$", message = "Informe o WhatsApp somente com números, incluindo DDI e DDD.") String teamWhatsapp
    ) {}

    public record DeleteSummary(
            int deleted,
            int protectedApproved,
            String message
    ) {}

    public record AuditResponse(
            Long id,
            String itemType,
            Long itemId,
            String itemKey,
            String description,
            BigDecimal oldValue,
            BigDecimal newValue,
            String oldText,
            String newText,
            String changedBy,
            OffsetDateTime changedAt
    ) {}
}
