package br.com.nh.cotacao.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

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

    public record UpdatePriceRequest(@NotNull @DecimalMin("0.00") BigDecimal monthlyPrice) {}

    public record AuditResponse(
            Long id,
            String itemType,
            Long itemId,
            String description,
            BigDecimal oldValue,
            BigDecimal newValue,
            String changedBy,
            OffsetDateTime changedAt
    ) {}
}
