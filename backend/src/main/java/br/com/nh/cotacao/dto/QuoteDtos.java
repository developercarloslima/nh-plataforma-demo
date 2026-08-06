package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.entity.MotorcycleOrigin;
import br.com.nh.cotacao.entity.QuoteOrigin;
import br.com.nh.cotacao.entity.QuoteStatus;
import br.com.nh.cotacao.entity.Region;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class QuoteDtos {
    private QuoteDtos() {
    }

    public record OptionsRequest(
            @NotBlank String categoryCode,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            @NotNull @DecimalMin("0.01") BigDecimal fipeValue
    ) {
        public MotorcycleOrigin effectiveMotorcycleOrigin() {
            if (motorcycleOrigin != null) return motorcycleOrigin;
            if (region == Region.NORTHEAST) return MotorcycleOrigin.NORTHEAST;
            if (region == Region.CAPITAL) return MotorcycleOrigin.CAPITAL;
            return null;
        }
    }

    public record CoverageOption(
            String code,
            String name,
            CoverageStatus status,
            String detail,
            BigDecimal monthlyPrice
    ) {
    }

    public record PlanOption(
            String code,
            String name,
            String subtitle,
            BigDecimal tableMonthlyValue,
            BigDecimal mandatoryMonthlyFee,
            BigDecimal monthlyValue,
            BigDecimal oneTimeFee,
            String mandatoryFeeDescription,
            List<CoverageOption> coverages
    ) {
    }

    public record OptionsResponse(
            String categoryCode,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            BigDecimal fipeValue,
            List<PlanOption> plans
    ) {
    }

    public record CreateQuoteRequest(
            @NotNull UUID consultantId,
            @NotBlank @Size(max = 120) String customerName,
            @NotBlank @Pattern(regexp = "^[0-9.\\-]{11,14}$", message = "CPF inválido") String cpf,
            @Size(max = 30) String whatsapp,
            @Size(max = 10) String plate,
            @NotBlank @Size(max = 120) String model,
            @NotNull @Min(1950) @Max(2100) Integer manufactureYear,
            @NotNull Boolean zeroKm,
            @NotNull @DecimalMin("0.01") BigDecimal fipeValue,
            @NotBlank String categoryCode,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            @NotBlank String selectedPlanCode,
            @Size(max = 20) List<@NotBlank String> selectedOptionalCodes
    ) {
        public CreateQuoteRequest {
            selectedOptionalCodes = selectedOptionalCodes == null ? List.of() : List.copyOf(selectedOptionalCodes);
        }

        public MotorcycleOrigin effectiveMotorcycleOrigin() {
            if (motorcycleOrigin != null) return motorcycleOrigin;
            if (region == Region.NORTHEAST) return MotorcycleOrigin.NORTHEAST;
            if (region == Region.CAPITAL) return MotorcycleOrigin.CAPITAL;
            return null;
        }
    }

    public record CreatePublicQuoteRequest(
            @NotBlank @Size(max = 120) String customerName,
            @NotBlank @Size(max = 30) String whatsapp,
            @NotBlank @Pattern(regexp = "^[0-9.\\-]{11,14}$", message = "CPF inválido") String cpf,
            @Size(max = 10) String plate,
            @NotBlank @Size(max = 120) String model,
            @NotNull @Min(1950) @Max(2100) Integer manufactureYear,
            @NotNull Boolean zeroKm,
            @NotNull @DecimalMin("0.01") BigDecimal fipeValue,
            @NotBlank String categoryCode,
            Region region,
            MotorcycleOrigin motorcycleOrigin,
            @NotBlank String selectedPlanCode,
            @Size(max = 20) List<@NotBlank String> selectedOptionalCodes
    ) {
        public CreatePublicQuoteRequest {
            selectedOptionalCodes = selectedOptionalCodes == null ? List.of() : List.copyOf(selectedOptionalCodes);
        }

        public MotorcycleOrigin effectiveMotorcycleOrigin() {
            if (motorcycleOrigin != null) return motorcycleOrigin;
            if (region == Region.NORTHEAST) return MotorcycleOrigin.NORTHEAST;
            if (region == Region.CAPITAL) return MotorcycleOrigin.CAPITAL;
            return null;
        }
    }

    public record SelectedOptionalResponse(
            String code,
            String name,
            String detail,
            BigDecimal monthlyPrice
    ) {
    }

    public record InspectionPhotoResponse(
            UUID id,
            String label,
            String fileName,
            String driveFileUrl,
            Integer sortOrder
    ) {
    }

    public record QuoteResponse(
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
            String selectedPlanCode,
            String selectedPlanName,
            BigDecimal baseMonthlyValue,
            BigDecimal mandatoryMonthlyFee,
            BigDecimal optionalMonthlyValue,
            BigDecimal monthlyValue,
            BigDecimal oneTimeFee,
            String mandatoryFeeDescription,
            List<SelectedOptionalResponse> selectedOptionals,
            QuoteStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime validUntil,
            boolean expired,
            OffsetDateTime decidedAt,
            String driveFolderUrl,
            String drivePdfUrl,
            OffsetDateTime inspectionCompletedAt,
            List<InspectionPhotoResponse> inspectionPhotos,
            String teamWhatsappUrl,
            String clientWhatsappUrl,
            String inspectionUrl,
            String selfServiceWhatsappUrl
    ) {
    }

    public record DecisionRequest(@NotNull QuoteStatus decision) {
    }

    public record DecisionResponse(
            QuoteResponse quote,
            String inspectionUrl,
            String whatsappUrl
    ) {
    }

    public record InspectionUploadResponse(
            QuoteResponse quote,
            String driveFolderUrl,
            String drivePdfUrl,
            String pdfUrl,
            String teamWhatsappUrl,
            String clientWhatsappUrl
    ) {
    }
}
