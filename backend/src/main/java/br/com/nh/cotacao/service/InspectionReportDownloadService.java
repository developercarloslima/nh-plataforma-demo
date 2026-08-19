package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
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
                    .findFirst();

            boolean finalDecision = request.getStatus() == InspectionRequestStatus.APPROVED
                    || request.getStatus() == InspectionRequestStatus.REJECTED;

            // Depois da decisão da Supervisão, o dossiê salvo é a fonte oficial.
            // Isso evita que uma troca futura do regulamento altere um PDF já aprovado/rejeitado.
            if (finalDecision && storedReport.isPresent() && isGeneratedAfterDecision(storedReport.get(), request)) {
                return storageService.readAll(storedReport.get().getId());
            }

            boolean sourceAssetUnavailable = request.getAssets().stream()
                    .filter(asset -> asset.getAssetType() != InspectionAssetType.REPORT)
                    .anyMatch(asset -> !storageService.isAvailable(asset));

            // Para decisões antigas cujo PDF ainda seja anterior à decisão, tenta fazer o upgrade
            // enquanto os arquivos originais continuam disponíveis.
            if (finalDecision && !sourceAssetUnavailable) {
                byte[] finalReport = pdfService.generate(request);
                int reportOrder = storedReport.map(InspectionAsset::getSortOrder)
                        .orElseGet(() -> defaultReportOrder(request));
                storageService.replaceGeneratedReport(
                        request,
                        "Dossiê final da vistoria",
                        "dossie-final-vistoria-" + request.getId() + ".pdf",
                        reportOrder,
                        finalReport
                );
                inspectionRepository.flush();
                return finalReport;
            }

            // Depois que algum original sair da retenção operacional, usamos o relatório
            // consolidado permanente que foi criado enquanto todos os arquivos ainda existiam.
            if (sourceAssetUnavailable && storedReport.isPresent()) {
                return storageService.readAll(storedReport.get().getId());
            }

            return pdfService.generate(request);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o relatório desta vistoria. Os arquivos preservados não foram alterados.", exception);
        }
    }

    private boolean isGeneratedAfterDecision(InspectionAsset report, InspectionRequest request) {
        if (request.getReviewedAt() == null || report.getStoredAt() == null) return false;
        return !report.getStoredAt().isBefore(request.getReviewedAt());
    }

    private int defaultReportOrder(InspectionRequest request) {
        return request.getRequestType() == InspectionRequestType.NEW_INSPECTION
                ? request.getVehicleType().requiredPhotoCount() + 6
                : 2;
    }
}
