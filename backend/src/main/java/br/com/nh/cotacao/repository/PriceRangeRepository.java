package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.PriceRange;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface PriceRangeRepository extends JpaRepository<PriceRange, Long> {
    Optional<PriceRange> findFirstByPlanIdAndMinValueLessThanEqualAndMaxValueGreaterThanEqualOrderByMinValueAsc(
            Long planId,
            BigDecimal fipeForMin,
            BigDecimal fipeForMax
    );

    boolean existsByPlan_IdAndMinValueLessThanEqualAndMaxValueGreaterThanEqual(
            Long planId,
            BigDecimal maxValue,
            BigDecimal minValue
    );

    List<PriceRange> findByPlan_Id(Long planId);

    @EntityGraph(attributePaths = {"plan", "plan.category"})
    @Query("select p from PriceRange p order by p.plan.name asc, p.minValue asc")
    List<PriceRange> findAllForAdmin();
}
