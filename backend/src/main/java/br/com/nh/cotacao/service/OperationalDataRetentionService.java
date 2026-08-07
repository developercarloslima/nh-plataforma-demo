package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import br.com.nh.cotacao.repository.QuotationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
public class OperationalDataRetentionService {
    private static final Logger log = LoggerFactory.getLogger(OperationalDataRetentionService.class);

    private final InspectionRequestRepository inspectionRepository;
    private final QuotationRepository quotationRepository;
    private final CatalogChangeAuditRepository auditRepository;
    private final int retentionDays;

    public OperationalDataRetentionService(
            InspectionRequestRepository inspectionRepository,
            QuotationRepository quotationRepository,
            CatalogChangeAuditRepository auditRepository,
            @Value("${app.operational-retention.retention-days:40}") int retentionDays
    ) {
        this.inspectionRepository = inspectionRepository;
        this.quotationRepository = quotationRepository;
        this.auditRepository = auditRepository;
        this.retentionDays = Math.max(1, retentionDays);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(cron = "${app.operational-retention.cleanup-cron:0 40 * * * *}")
    @Transactional
    public void cleanupExpiredOperationalData() {
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(retentionDays);

        // A regra é propositalmente independente de status: inclusive cotações ACEITAS
        // e vistorias APROVADAS são eliminadas quando ultrapassam o prazo de retenção.
        int deletedInspections = inspectionRepository.deleteCreatedBefore(cutoff);
        int deletedQuotes = quotationRepository.deleteCreatedBefore(cutoff);

        if (deletedInspections > 0 || deletedQuotes > 0) {
            String summary = "prazo=" + retentionDays + " dias; vistorias=" + deletedInspections
                    + "; cotações=" + deletedQuotes + "; corte=" + cutoff;
            auditRepository.save(CatalogChangeAudit.createText(
                    "DATA_RETENTION", null, "AUTO", "Limpeza automática de dados operacionais", null, summary, "SYSTEM"
            ));
            log.info("Retenção NH executada: {}", summary);
        }
    }

    public int getRetentionDays() {
        return retentionDays;
    }
}
