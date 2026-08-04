package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.AdminDtos.*;
import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import br.com.nh.cotacao.repository.PlanCoverageRepository;
import br.com.nh.cotacao.repository.PriceRangeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class AdminCatalogService {
    private final PriceRangeRepository priceRepository;
    private final PlanCoverageRepository coverageRepository;
    private final CatalogChangeAuditRepository auditRepository;

    public AdminCatalogService(
            PriceRangeRepository priceRepository,
            PlanCoverageRepository coverageRepository,
            CatalogChangeAuditRepository auditRepository
    ) {
        this.priceRepository = priceRepository;
        this.coverageRepository = coverageRepository;
        this.auditRepository = auditRepository;
    }

    @Transactional(readOnly = true)
    public List<PriceRangeResponse> priceRanges() {
        return priceRepository.findAllForAdmin().stream().map(item -> new PriceRangeResponse(
                item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getPlan().getCategory().getName(),
                item.getPlan().getRegion().name(), item.getMinValue(), item.getMaxValue(), item.getMonthlyPrice()
        )).toList();
    }

    @Transactional(readOnly = true)
    public List<OptionalPriceResponse> optionals() {
        return coverageRepository.findForAdmin(CoverageStatus.OPTIONAL).stream().map(item -> new OptionalPriceResponse(
                item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getCoverage().getCode(),
                item.getCoverage().getName(), item.getDetail(), item.getMonthlyPrice()
        )).toList();
    }

    @Transactional
    public PriceRangeResponse updatePriceRange(Long id, BigDecimal value, String username) {
        var item = priceRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Faixa de preço não encontrada."));
        BigDecimal old = item.getMonthlyPrice();
        item.updateMonthlyPrice(value);
        priceRepository.save(item);
        auditRepository.save(CatalogChangeAudit.create(
                "PRICE_RANGE", id, item.getPlan().getName() + " — " + item.getMinValue() + " a " + item.getMaxValue(), old, value, username
        ));
        return new PriceRangeResponse(item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getPlan().getCategory().getName(),
                item.getPlan().getRegion().name(), item.getMinValue(), item.getMaxValue(), item.getMonthlyPrice());
    }

    @Transactional
    public OptionalPriceResponse updateOptional(Long id, BigDecimal value, String username) {
        var item = coverageRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Opcional não encontrado."));
        BigDecimal old = item.getMonthlyPrice();
        item.updateMonthlyPrice(value);
        coverageRepository.save(item);
        auditRepository.save(CatalogChangeAudit.create(
                "OPTIONAL", id, item.getPlan().getName() + " — " + item.getCoverage().getName(), old, value, username
        ));
        return new OptionalPriceResponse(item.getId(), item.getPlan().getCode(), item.getPlan().getName(), item.getCoverage().getCode(),
                item.getCoverage().getName(), item.getDetail(), item.getMonthlyPrice());
    }

    @Transactional(readOnly = true)
    public List<AuditResponse> audit() {
        return auditRepository.findTop100ByOrderByChangedAtDesc().stream().map(item -> new AuditResponse(
                item.getId(), item.getItemType(), item.getItemId(), item.getDescription(), item.getOldValue(), item.getNewValue(),
                item.getChangedBy(), item.getChangedAt()
        )).toList();
    }
}
