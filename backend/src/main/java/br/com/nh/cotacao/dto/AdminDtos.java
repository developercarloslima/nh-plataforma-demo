package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.CoverageStatus;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public final class AdminDtos {
    private AdminDtos() {}

    public record PriceRangeResponse(
            Long id,
            String planCode,
            String planName,
            String category,
            String region,
            BigDecimal minValue,
            BigDecimal maxValue,
            BigDecimal monthlyPrice
    ) {}

    public record OptionalPriceResponse(
            Long id,
            String planCode,
            String planName,
            String coverageCode,
            String coverageName,
            String detail,
            BigDecimal monthlyPrice
    ) {}

    public record PlanAdminResponse(
            Long id,
            String code,
            String name,
            String subtitle,
            String category,
            String region,
            boolean active
    ) {}

    public record UpdatePlanRequest(
            @Size(max = 120) String name,
            @Size(max = 180) String subtitle,
            Boolean active
    ) {}

    public record CoverageAdminResponse(
            Long id,
            Long planId,
            String planCode,
            String planName,
            String category,
            String region,
            Long coverageId,
            String coverageCode,
            String coverageName,
            CoverageStatus status,
            String detail,
            BigDecimal monthlyPrice,
            Integer sortOrder
    ) {}

    public record CreateCoverageRequest(
            @NotBlank @Size(max = 180) String coverageName,
            @Size(max = 80) String coverageCode,
            @NotNull CoverageStatus status,
            @Size(max = 240) String detail,
            @DecimalMin("0.00") BigDecimal monthlyPrice,
            @NotNull @Min(0) Integer sortOrder
    ) {}

    public record UpdateCoverageRequest(
            @NotBlank @Size(max = 180) String coverageName,
            @NotNull CoverageStatus status,
            @Size(max = 240) String detail,
            @DecimalMin("0.00") BigDecimal monthlyPrice,
            @NotNull @Min(0) Integer sortOrder
    ) {}

    public record UpdatePriceRequest(@NotNull @DecimalMin("0.00") BigDecimal monthlyPrice) {}

    public record AuditResponse(
            Long id,
            String itemType,
            Long itemId,
            String description,
            BigDecimal oldValue,
            BigDecimal newValue,
            String oldText,
            String newText,
            String changedBy,
            OffsetDateTime changedAt
    ) {}
}
