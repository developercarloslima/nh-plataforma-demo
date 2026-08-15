package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.Plan;
import br.com.nh.cotacao.repository.PriceRangeRepository;
import br.com.nh.cotacao.repository.PromotionalMotorcyclePriceRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class PricingService {

    private final PriceRangeRepository priceRangeRepository;
    private final PromotionalMotorcyclePriceRepository promotionalMotorcyclePriceRepository;

    public PricingService(
            PriceRangeRepository priceRangeRepository,
            PromotionalMotorcyclePriceRepository promotionalMotorcyclePriceRepository
    ) {
        this.priceRangeRepository = priceRangeRepository;
        this.promotionalMotorcyclePriceRepository = promotionalMotorcyclePriceRepository;
    }

    public record PromotionalMotorcyclePriceView(
            String tierCode,
            String label,
            Integer minCc,
            Integer maxCc,
            BigDecimal minFipe,
            BigDecimal maxFipe,
            BigDecimal monthlyPrice
    ) {}

    public record PricingResult(
            BigDecimal tableMonthlyValue,
            BigDecimal mandatoryMonthlyFee,
            BigDecimal oneTimeFee,
            String mandatoryFeeDescription
    ) {
        public BigDecimal totalMonthlyValue() {
            return tableMonthlyValue.add(mandatoryMonthlyFee).setScale(2, RoundingMode.HALF_UP);
        }
    }

    public List<PromotionalMotorcyclePriceView> promotionalMotorcyclePrices() {
        return promotionalMotorcyclePriceRepository.findAllByOrderBySortOrderAsc().stream()
                .map(item -> new PromotionalMotorcyclePriceView(
                        item.getTierCode(), item.getLabel(), item.getMinCc(), item.getMaxCc(), item.getMinFipe(), item.getMaxFipe(),
                        item.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP)
                ))
                .toList();
    }

    public Optional<String> findMatchingPromotionalTierCode(BigDecimal fipeValue, Integer motorcycleCc) {
        if (fipeValue == null || fipeValue.signum() <= 0 || motorcycleCc == null || motorcycleCc < 1) {
            return Optional.empty();
        }
        return promotionalMotorcyclePriceRepository.findAllByOrderBySortOrderAsc().stream()
                .filter(item -> item.matches(fipeValue, motorcycleCc))
                .map(item -> item.getTierCode())
                .findFirst();
    }

    public Optional<BigDecimal> calculate(Plan plan, BigDecimal fipeValue) {
        return calculateBreakdown(plan, fipeValue).map(PricingResult::totalMonthlyValue);
    }

    public Optional<PricingResult> calculateBreakdown(Plan plan, BigDecimal fipeValue) {
        Optional<BigDecimal> tableValue = findTableValue(plan, fipeValue);
        if (tableValue.isEmpty()) {
            return Optional.empty();
        }

        boolean trackerRequired = plan.getTrackerRequiredAbove() != null
                && fipeValue.compareTo(plan.getTrackerRequiredAbove()) >= 0;

        BigDecimal mandatoryMonthlyFee = trackerRequired && plan.getTrackerMonthlyFee() != null
                ? plan.getTrackerMonthlyFee()
                : BigDecimal.ZERO;
        BigDecimal oneTimeFee = trackerRequired && plan.getTrackerInstallationFee() != null
                ? plan.getTrackerInstallationFee()
                : BigDecimal.ZERO;
        String description = trackerRequired
                ? "Rastreador obrigatório para veículos com FIPE a partir de " + formatCurrency(plan.getTrackerRequiredAbove())
                : null;

        return Optional.of(new PricingResult(
                tableValue.get().setScale(2, RoundingMode.HALF_UP),
                mandatoryMonthlyFee.setScale(2, RoundingMode.HALF_UP),
                oneTimeFee.setScale(2, RoundingMode.HALF_UP),
                description
        ));
    }

    /**
     * Regra promocional de motocicletas. A tabela só é considerada quando o
     * plano MOTO_PROMO_2026 está ativo no catálogo administrativo.
     * As faixas, limites de cilindrada/FIPE e mensalidades são mantidos na aba Valores do painel administrativo.
     * A faixa escolhida na cotação é validada contra as condições atualmente salvas pelo Admin.
     */
    public Optional<PricingResult> calculatePromotionalMotorcycle(
            Plan plan, BigDecimal fipeValue, Integer motorcycleCc, String tierCode
    ) {
        if (plan == null || !"MOTO_PROMO_2026".equals(plan.getCode()) || !Boolean.TRUE.equals(plan.getActive())) {
            return Optional.empty();
        }
        if (fipeValue == null || fipeValue.signum() <= 0 || motorcycleCc == null || motorcycleCc < 1 || motorcycleCc > 2500) {
            return Optional.empty();
        }
        if (tierCode == null || tierCode.isBlank()) return Optional.empty();

        return promotionalMotorcyclePriceRepository.findByTierCode(tierCode.trim())
                .filter(item -> item.matches(fipeValue, motorcycleCc))
                .map(item -> new PricingResult(
                        item.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP),
                        BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                        BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                        null
                ));
    }

    private String formatCurrency(BigDecimal value) {
        return NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR")).format(value);
    }

    private Optional<BigDecimal> findTableValue(Plan plan, BigDecimal fipeValue) {
        var matching = priceRangeRepository
                .findFirstByPlanIdAndMinValueLessThanEqualAndMaxValueGreaterThanEqualOrderByMinValueAsc(
                        plan.getId(), fipeValue, fipeValue
                );

        if (matching.isPresent()) {
            return Optional.of(matching.get().getMonthlyPrice());
        }

        if (plan.getExtraAbove() == null
                || plan.getExtraStep() == null
                || plan.getExtraIncrement() == null
                || plan.getExtraBasePrice() == null
                || fipeValue.compareTo(plan.getExtraAbove()) <= 0) {
            return Optional.empty();
        }

        BigDecimal difference = fipeValue.subtract(plan.getExtraAbove());
        BigDecimal steps = difference.divide(plan.getExtraStep(), 0, RoundingMode.CEILING);
        BigDecimal price = plan.getExtraBasePrice().add(plan.getExtraIncrement().multiply(steps));
        return Optional.of(price.setScale(2, RoundingMode.HALF_UP));
    }
}
