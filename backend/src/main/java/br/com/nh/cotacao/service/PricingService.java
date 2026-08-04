package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.Plan;
import br.com.nh.cotacao.repository.PriceRangeRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
                ? "Rastreador obrigatório para caminhões com FIPE a partir de R$ 150 mil"
                : null;

        return Optional.of(new PricingResult(
                tableValue.get().setScale(2, RoundingMode.HALF_UP),
                mandatoryMonthlyFee.setScale(2, RoundingMode.HALF_UP),
                oneTimeFee.setScale(2, RoundingMode.HALF_UP),
                description
        ));
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
