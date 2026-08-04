package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.Plan;
import br.com.nh.cotacao.entity.Region;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PlanRepository extends JpaRepository<Plan, Long> {

    @EntityGraph(attributePaths = {"category", "coverages", "coverages.coverage"})
    List<Plan> findByCategory_CodeAndRegionAndActiveTrueOrderByDisplayOrder(String categoryCode, Region region);

    @EntityGraph(attributePaths = {"category", "coverages", "coverages.coverage"})
    Optional<Plan> findByCodeAndActiveTrue(String code);

    @EntityGraph(attributePaths = {"category"})
    @Query("select p from Plan p order by p.category.name asc, p.region asc, p.displayOrder asc")
    List<Plan> findAllForAdmin();
}
