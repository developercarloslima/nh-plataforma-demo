package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.entity.InspectionRequestType;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class InspectionReportDownloadService {
    private final InspectionRequestRepository inspectionRepository;
    private final RetratoPdfService pdfService;
    private final InspectionAssetStorageService storageService;

    public InspectionReportDownloadService(
            InspectionRequestRepository inspectionRepository,
            RetratoPdfService pdfService,
            InspectionAssetStorageService storageService
    ) {
        this.inspectionRepository = inspectionRepository;
        this.pdfService = pdfService;
        this.storageService = storageService;
    }

    @Transactional
    public byte[] generate(UUID inspectionId) {
        InspectionRequest request = inspectionRepository.findById(inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Vistoria não encontrada."));
        try {
            Optional<InspectionAsset> storedReport = request.getAssets().stream()
                    .filter(asset -> asset.getAssetType() == InspectionAssetType.REPORT)
                    .filter(storageService::isAvailable)
                    .max((a, b) -> {
                        if (a.getStoredAt() == null && b.getStoredAt() == null) return 0;
                        if (a.getStoredAt() == null) return -1;
                        if (b.getStoredAt() == null) return 1;
                        return a.getStoredAt().compareTo(b.getStoredAt());
                    });

            byte[] storedBytes = storedReport.isPresent()
                    ? storageService.readAll(storedReport.get().getId())
                    : null;

            // Não troca o arquivo no meio de uma cerimônia WebAuthn já iniciada, pois o
            // hash do dossiê faz parte da evidência criptográfica em andamento. Depois do
            // aceite o próprio fluxo gera novamente o PDF no layout vigente.
            java.time.OffsetDateTime now = java.time.OffsetDateTime.now();
            boolean digitalAcceptanceInProgress = request.getAcceptedAt() == null
                    && request.getAcceptanceEvidenceHash() != null
                    && !request.getAcceptanceEvidenceHash().isBlank()
                    && ((request.getWebauthnRegistrationExpiresAt() != null && request.getWebauthnRegistrationExpiresAt().isAfter(now))
                        || (request.getWebauthnAssertionExpiresAt() != null && request.getWebauthnAssertionExpiresAt().isAfter(now)));
            if (digitalAcceptanceInProgress && storedBytes != null) {
                return storedBytes;
            }

            // Todo download passa pelo verificador de versão do layout. Assim, PDFs antigos
            // já aprovados/rejeitados também são atualizados para o padrão vigente.
            if (storedBytes != null && pdfService.isCurrentLayout(storedBytes)) {
                return storedBytes;
            }

            boolean sourceAssetUnavailable = request.getAssets().stream()
                    .filter(asset -> asset.getAssetType() != InspectionAssetType.REPORT)
                    .anyMatch(asset -> !storageService.isAvailable(asset));

            byte[] standardized;
            if (!sourceAssetUnavailable) {
                // Melhor cenário: reconstrói todo o dossiê com fotos/documentos originais,
                // CPF completo e o rodapé de assinaturas em todas as páginas.
                standardized = pdfService.generate(request);
            } else if (storedBytes != null) {
                // Para históricos fora da retenção, preserva integralmente o PDF anterior
                // como anexo visual dentro do documento padronizado.
                standardized = pdfService.standardizeLegacyReport(request, storedBytes);
            } else {
                standardized = pdfService.generate(request);
            }

            int reportOrder = storedReport.map(InspectionAsset::getSortOrder)
                    .orElseGet(() -> defaultReportOrder(request));
            storageService.replaceGeneratedReport(
                    request,
                    "Dossiê padronizado da vistoria",
                    "dossie-padronizado-vistoria-" + request.getId() + ".pdf",
                    reportOrder,
                    standardized
            );
            inspectionRepository.flush();
            return standardized;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o relatório desta vistoria. Os arquivos preservados não foram alterados.", exception);
        }
    }


    private int defaultReportOrder(InspectionRequest request) {
        return request.getRequestType() == InspectionRequestType.NEW_INSPECTION
                ? request.getVehicleType().requiredPhotoCount() + 6
                : 2;
    }
}
