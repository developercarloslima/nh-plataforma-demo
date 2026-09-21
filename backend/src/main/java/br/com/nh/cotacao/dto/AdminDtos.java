package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.InspectionAnalysisStage;
import br.com.nh.cotacao.entity.MotorcycleOrigin;
import br.com.nh.cotacao.entity.QuoteOrigin;
import br.com.nh.cotacao.entity.QuoteStatus;
import br.com.nh.cotacao.entity.Region;
import br.com.nh.cotacao.entity.RearWindowBranding;
import jakarta.validation.Valid;
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

    public record CoverageRuleAdminResponse(
            Long id,
            String categoryCode,
            BigDecimal minFipe,
            BigDecimal maxFipe,
            BigDecimal normalAmount,
            BigDecimal discountedAmount,
            Integer sortOrder
    ) {}

    public record CoverageRuleRequest(
            @Size(max = 50) String categoryCode,
            @NotNull @DecimalMin("0.00") BigDecimal minFipe,
            @DecimalMin("0.00") BigDecimal maxFipe,
            @NotNull @DecimalMin("0.00") BigDecimal normalAmount,
            @DecimalMin("0.00") BigDecimal discountedAmount,
            @NotNull @Min(0) Integer sortOrder
    ) {}

    public record CoverageAdminResponse(
            Long id,
            Long coverageId,
            String coverageCode,
            Long planId,
            String planName,
            String category,
            String region,
            MotorcycleOrigin motorcycleOrigin,
            String coverageName,
            CoverageStatus status,
            String detail,
            BigDecimal monthlyPrice,
            Integer sortOrder,
            List<CoverageRuleAdminResponse> rules
    ) {}

    public record CreateCoverageRequest(
            @NotEmpty List<@NotNull Long> planIds,
            @NotBlank @Size(max = 180) String coverageName,
            @NotNull CoverageStatus status,
            @Size(max = 240) String detail,
            @DecimalMin("0.00") BigDecimal monthlyPrice,
            @NotNull @Min(0) Integer sortOrder,
            @Size(max = 50) List<@Valid CoverageRuleRequest> rules
    ) {
        public CreateCoverageRequest {
            planIds = planIds == null ? List.of() : List.copyOf(planIds);
            rules = rules == null ? List.of() : List.copyOf(rules);
        }
    }

    public record UpdateCoverageRequest(
            @NotEmpty List<@NotNull Long> planIds,
            @NotBlank @Size(max = 180) String coverageName,
            @NotNull CoverageStatus status,
            @Size(max = 240) String detail,
            @DecimalMin("0.00") BigDecimal monthlyPrice,
            @NotNull @Min(0) Integer sortOrder,
            @Size(max = 50) List<@Valid CoverageRuleRequest> rules
    ) {
        public UpdateCoverageRequest {
            planIds = planIds == null ? List.of() : List.copyOf(planIds);
            rules = rules == null ? List.of() : List.copyOf(rules);
        }
    }

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

    public record UpdateAdminQuoteDetailsRequest(
            @NotBlank @Size(max = 120) String customerName,
            @Size(max = 14) String customerCpf,
            @Size(max = 30) String whatsapp,
            @Size(max = 10) String plate,
            @NotBlank @Size(max = 120) String model,
            @NotNull @Min(1950) @Max(2100) Integer modelYear,
            @NotNull Boolean zeroKm,
            @Size(max = 1200) String observation
    ) {}

    public record UpdateInspectionDetailsRequest(
            @NotBlank @Size(max = 140) String associateName,
            @NotBlank @Size(max = 14) String cpf,
            @Size(max = 30) String whatsapp,
            @Size(max = 10) String plate,
            @NotBlank @Size(max = 120) String model,
            @NotNull @Min(1950) @Max(2100) Integer modelYear,
            @NotNull Boolean zeroKm,
            @Size(max = 600) String residenceAddress
    ) {}

    public record UpdateInspectionContractValuesRequest(
            @NotNull @DecimalMin("0.01") BigDecimal fipeValue,
            @NotNull @DecimalMin("0.01") BigDecimal monthlyValue,
            @NotNull @Min(0) @Max(30) Integer discountPercent,
            @NotNull RearWindowBranding rearWindowBranding,
            @NotNull List<@NotBlank @Size(max = 80) String> benefitCodes,
            Boolean manualMonthlyOverride
    ) {
        public UpdateInspectionContractValuesRequest {
            benefitCodes = benefitCodes == null ? List.of() : List.copyOf(benefitCodes);
            manualMonthlyOverride = Boolean.TRUE.equals(manualMonthlyOverride);
        }
    }

    public record CommercialPricingPreviewRequest(
            @NotNull @DecimalMin("0.01") BigDecimal fipeValue,
            @NotNull @Min(0) @Max(30) Integer discountPercent,
            @NotNull List<@NotBlank @Size(max = 80) String> benefitCodes
    ) {
        public CommercialPricingPreviewRequest {
            benefitCodes = benefitCodes == null ? List.of() : List.copyOf(benefitCodes);
        }
    }

    public record CommercialPricingPreviewResponse(
            BigDecimal planBaseMonthlyValue,
            BigDecimal mandatoryMonthlyFee,
            BigDecimal oneTimeFee,
            String mandatoryFeeDescription,
            BigDecimal optionalsMonthlyValue,
            BigDecimal subtotalBeforeDiscount,
            BigDecimal discountValue,
            BigDecimal finalMonthlyValue,
            boolean catalogBased
    ) {}

    public record CommercialBenefitResponse(
            String code,
            String name,
            CoverageStatus catalogStatus,
            String detail,
            BigDecimal monthlyPrice,
            boolean selected,
            boolean locked,
            String lockReason
    ) {}

    public record UpdatePublicQuoteAssignmentSettingsRequest(@NotNull Boolean enabled) {}

    public record PublicQuoteAssignmentSettingsResponse(
            boolean enabled,
            String updatedBy,
            OffsetDateTime updatedAt
    ) {}

    public record UpdateInspectionStatusRequest(
            @NotNull InspectionRequestStatus status,
            @Size(max = 1200) String adminNote,
            UUID analystId,
            @Size(max = 140) String analystName
    ) {}

    public record AdminQuoteResponse(
            UUID id,
            String quoteNumber,
            QuoteOrigin origin,
            UUID consultantId,
            String consultantName,
            String customerName,
            String maskedCpf,
            String customerCpf,
            String whatsapp,
            String plate,
            String model,
            Integer manufactureYear,
            boolean zeroKm,
            boolean detailsEditable,
            BigDecimal fipeValue,
            Boolean auctionOrChassisRemarked,
            Integer indemnityFipePercent,
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
            OffsetDateTime updatedAt,
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
            String cpf,
            String whatsapp,
            String plate,
            boolean zeroKm,
            String vehicleModel,
            Integer modelYear,
            String residenceAddress,
            String contractedPlan,
            BigDecimal fipeValue,
            BigDecimal monthlyValue,
            BigDecimal preDiscountMonthlyValue,
            Integer billingDueDay,
            LocalDate firstBillingDueDate,
            Integer discountPercent,
            RearWindowBranding rearWindowBranding,
            String selectedPlanName,
            List<CommercialBenefitResponse> commercialBenefits,
            boolean contractChangePending,
            Integer pendingDiscountPercent,
            RearWindowBranding pendingRearWindowBranding,
            List<String> pendingBenefitCodes,
            BigDecimal pendingFipeValue,
            BigDecimal pendingMonthlyValue,
            OffsetDateTime contractChangeRequestedAt,
            String contractChangeConfirmationUrl,
            String contractChangeWhatsappUrl,
            String signatureUrl,
            UUID consultantId,
            String consultantName,
            UUID assignedAnalystId,
            String assignedAnalystName,
            InspectionAnalysisStage analysisStage,
            OffsetDateTime registrationCompletedAt,
            String registrationCompletedByName,
            InspectionRequestStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            OffsetDateTime expiresAt,
            boolean expiredWithoutFiles,
            OffsetDateTime completedAt,
            String adminNote,
            String supervisionNote,
            OffsetDateTime supervisionNoteUpdatedAt,
            String supervisionNoteByName,
            OffsetDateTime reviewedAt,
            UUID reviewedByCollaboratorId,
            String reviewedByName,
            String reviewedByRole,
            String publicUrl,
            String driveFolderUrl,
            String reportUrl,
            String quotationPdfUrl,
            String teamWhatsappUrl,
            String teamEmailUrl,
            String associateInspectionWhatsappUrl,
            String consultantInspectionWhatsappUrl,
            String associateDecisionWhatsappUrl,
            OffsetDateTime decisionMessageSentAt,
            boolean associateDecisionMessagePending,
            int assetCount,
            int expiredAssetCount,
            OffsetDateTime filesExpireAt,
            OffsetDateTime digitalAcceptedAt,
            String digitalAcceptanceProofHash,
            boolean digitalAcceptanceUserVerified,
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
