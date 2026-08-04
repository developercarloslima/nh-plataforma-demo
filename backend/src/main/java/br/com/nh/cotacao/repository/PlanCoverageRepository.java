package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.entity.PlanCoverage;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlanCoverageRepository extends JpaRepository<PlanCoverage, Long> {
    @EntityGraph(attributePaths = {"plan", "plan.category", "coverage"})
    @Query("select pc from PlanCoverage pc where pc.status = :status order by pc.plan.name asc, pc.sortOrder asc")
    List<PlanCoverage> findForAdmin(@Param("status") CoverageStatus status);

    @EntityGraph(attributePaths = {"plan", "plan.category", "coverage"})
    @Query("select pc from PlanCoverage pc order by pc.plan.name asc, pc.sortOrder asc, pc.coverage.name asc")
    List<PlanCoverage> findAllForAdmin();

    boolean existsByPlan_IdAndCoverage_Id(Long planId, Long coverageId);
}
