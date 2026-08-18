package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class InspectionReportDownloadService {
    private final InspectionRequestRepository inspectionRepository;
    private final RetratoPdfService pdfService;

    public InspectionReportDownloadService(InspectionRequestRepository inspectionRepository, RetratoPdfService pdfService) {
        this.inspectionRepository = inspectionRepository;
        this.pdfService = pdfService;
    }

    @Transactional(readOnly = true)
    public byte[] generate(UUID inspectionId) {
        InspectionRequest request = inspectionRepository.findById(inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Vistoria não encontrada."));
        try {
            return pdfService.generate(request);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o relatório desta vistoria antiga. Os demais arquivos permanecem preservados.", exception);
        }
    }
}
