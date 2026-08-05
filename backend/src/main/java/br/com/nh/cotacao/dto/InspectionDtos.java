package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.InspectionRequestType;
import br.com.nh.cotacao.entity.InspectionVehicleType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class InspectionDtos {
    private InspectionDtos() {}

    public record CreateInspectionRequest(
            @NotNull UUID consultantId,
            @NotNull InspectionRequestType requestType,
            InspectionVehicleType vehicleType,
            @NotBlank @Size(max = 140) String associateName,
            @NotBlank @Pattern(regexp = "^[0-9.\\-]{11,14}$", message = "CPF inválido") String cpf,
            @Size(max = 30) String whatsapp,
            @Size(max = 10) String plate,
            boolean zeroKm
    ) {}

    public record InspectionAssetResponse(
            UUID id,
            InspectionAssetType type,
            String label,
            String fileName,
            String driveFileUrl,
            int sortOrder
    ) {}

    public record InspectionResponse(
            UUID id,
            String publicToken,
            InspectionRequestType requestType,
            InspectionVehicleType vehicleType,
            String associateName,
            String maskedCpf,
            String whatsapp,
            String plate,
            String residenceAddress,
            UUID consultantId,
            String consultantName,
            InspectionRequestStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            OffsetDateTime completedAt,
            String publicUrl,
            String whatsappUrl,
            String teamWhatsappUrl,
            String associateCompletionWhatsappUrl,
            String driveFolderUrl,
            String reportUrl,
            List<InspectionAssetResponse> assets
    ) {}

    public record InspectionUploadResponse(
            InspectionResponse inspection,
            String driveFolderUrl,
            String reportUrl,
            boolean automaticWhatsappSent,
            String automaticWhatsappDetail
    ) {}
}
