package br.com.nh.cotacao.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class PortalDtos {
    private PortalDtos() {}

    public record ConsultantResponse(
            UUID id,
            String name,
            boolean active,
            String source,
            OffsetDateTime createdAt,
            OffsetDateTime lastPortalLoginAt,
            long quoteCount,
            long inspectionCount
    ) {}

    public record CreateConsultantRequest(
            @NotBlank @Size(min = 3, max = 140) String name
    ) {}

    public record UpdateConsultantRequest(
            @Size(min = 3, max = 140) String name,
            Boolean active
    ) {}
}
