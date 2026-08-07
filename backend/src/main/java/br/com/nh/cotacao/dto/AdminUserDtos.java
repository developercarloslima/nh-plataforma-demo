package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.security.PortalRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class AdminUserDtos {
    private AdminUserDtos() {}

    public record PortalUserResponse(
            UUID id,
            String username,
            String displayName,
            PortalRole role,
            boolean active,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            OffsetDateTime passwordChangedAt,
            OffsetDateTime lastLoginAt,
            String createdBy
    ) {}

    public record CreatePortalUserRequest(
            @NotBlank @Size(min = 3, max = 160) String username,
            @Size(max = 160) String displayName,
            @NotBlank @Size(min = 8, max = 120) String password,
            @NotNull PortalRole role
    ) {}

    public record UpdatePortalUserRequest(
            @Size(min = 3, max = 160) String username,
            @Size(max = 160) String displayName,
            PortalRole role,
            Boolean active
    ) {}

    public record ChangePortalUserPasswordRequest(
            @NotBlank @Size(min = 8, max = 120) String password
    ) {}
}
