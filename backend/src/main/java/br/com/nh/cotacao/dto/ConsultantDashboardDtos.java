package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.InspectionRequestType;
import br.com.nh.cotacao.entity.QuoteStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Pattern;

public final class ConsultantDashboardDtos {
    private ConsultantDashboardDtos() {}

    public record ConsultantQuoteSummary(
            UUID id,
            String quoteNumber,
            String customerName,
            String plate,
            boolean zeroKm,
            String model,
            String selectedPlanName,
            QuoteStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime validUntil,
            boolean expired,
            boolean hasCustomerCpf,
            String pdfUrl,
            UUID inspectionId,
            InspectionRequestStatus inspectionStatus,
            OffsetDateTime inspectionCompletedAt,
            String inspectionPublicUrl,
            String inspectionWhatsappUrl,
            String inspectionDriveFolderUrl,
            boolean inspectionHasFiles,
            int inspectionAssetCount
    ) {}

    public record ConsultantInspectionSummary(
            UUID id,
            InspectionRequestType requestType,
            String associateName,
            String plate,
            InspectionRequestStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            OffsetDateTime completedAt,
            String reportUrl,
            String whatsapp,
            String associateCompletionWhatsappUrl,
            OffsetDateTime completionMessageSentAt,
            boolean completionMessagePending,
            String publicUrl,
            String associateInspectionWhatsappUrl,
            String driveFolderUrl,
            boolean hasFiles,
            int assetCount,
            OffsetDateTime filesExpireAt,
            List<InspectionDtos.InspectionAssetResponse> assets
    ) {}


    public record StartInspectionRequest(
            @Pattern(regexp = "^[0-9.\\-]{11,14}$", message = "CPF inválido") String cpf
    ) {}

    public record RedoQuoteRequest(
            @Pattern(regexp = "^[0-9.\\-]{11,14}$", message = "CPF inválido") String cpf
    ) {}

    public record ConsultantDashboardResponse(
            UUID consultantId,
            String consultantName,
            List<ConsultantQuoteSummary> quotes,
            List<ConsultantInspectionSummary> inspections
    ) {}
}
