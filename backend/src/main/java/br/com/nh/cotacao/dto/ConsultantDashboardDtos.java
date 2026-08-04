package br.com.nh.cotacao.dto;

import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.InspectionRequestType;
import br.com.nh.cotacao.entity.QuoteStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

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
            InspectionRequestStatus inspectionStatus,
            OffsetDateTime inspectionCompletedAt
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
            boolean completionMessagePending
    ) {}

    public record ConsultantDashboardResponse(
            UUID consultantId,
            String consultantName,
            List<ConsultantQuoteSummary> quotes,
            List<ConsultantInspectionSummary> inspections
    ) {}
}
