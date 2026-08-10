package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.Plan;
import br.com.nh.cotacao.repository.PriceRangeRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;

@Service
public class PricingService {

    private final PriceRangeRepository priceRangeRepository;

    public PricingService(PriceRangeRepository priceRangeRepository) {
        this.priceRangeRepository = priceRangeRepository;
    }

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
     * Prioridade: FIPE até R$ 11.000 = R$ 35; depois 151-160cc = R$ 45;
     * 161-300cc = R$ 75. Fora dessas condições, não há preço promocional.
     */
    public Optional<PricingResult> calculatePromotionalMotorcycle(
            Plan plan, BigDecimal fipeValue, Integer motorcycleCc
    ) {
        if (plan == null || !"MOTO_PROMO_2026".equals(plan.getCode()) || !Boolean.TRUE.equals(plan.getActive())) {
            return Optional.empty();
        }
        if (fipeValue == null || fipeValue.signum() <= 0 || motorcycleCc == null || motorcycleCc < 1 || motorcycleCc > 300) {
            return Optional.empty();
        }

        BigDecimal monthly;
        if (fipeValue.compareTo(new BigDecimal("11000.00")) <= 0) {
            monthly = new BigDecimal("35.00");
        } else if (motorcycleCc >= 151 && motorcycleCc <= 160) {
            monthly = new BigDecimal("45.00");
        } else if (motorcycleCc >= 161 && motorcycleCc <= 300) {
            monthly = new BigDecimal("75.00");
        } else {
            return Optional.empty();
        }

        return Optional.of(new PricingResult(
                monthly.setScale(2, RoundingMode.HALF_UP),
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
