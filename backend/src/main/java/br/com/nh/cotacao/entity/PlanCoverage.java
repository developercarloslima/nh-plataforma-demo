package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "plan_coverages")
public class PlanCoverage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private Plan plan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "coverage_id", nullable = false)
    private Coverage coverage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CoverageStatus status;

    @Column(length = 240)
    private String detail;

    @Column(name = "monthly_price", precision = 14, scale = 2)
    private BigDecimal monthlyPrice;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    protected PlanCoverage() {
    }

    public static PlanCoverage create(
            Plan plan,
            Coverage coverage,
            CoverageStatus status,
            String detail,
            BigDecimal monthlyPrice,
            Integer sortOrder
    ) {
        PlanCoverage item = new PlanCoverage();
        item.plan = plan;
        item.coverage = coverage;
        item.update(status, detail, monthlyPrice, sortOrder);
        return item;
    }

    public void replacePlan(Plan plan) {
        if (plan == null) throw new IllegalArgumentException("Plano inválido.");
        this.plan = plan;
    }

    public void replaceCoverage(Coverage coverage) {
        if (coverage == null) throw new IllegalArgumentException("Cobertura inválida.");
        this.coverage = coverage;
    }

    public void update(CoverageStatus status, String detail, BigDecimal monthlyPrice, Integer sortOrder) {
        if (status == null) {
            throw new IllegalArgumentException("Defina se a cobertura está incluída, não incluída ou é opcional.");
        }
        if (sortOrder == null || sortOrder < 0) {
            throw new IllegalArgumentException("A ordem de exibição deve ser zero ou maior.");
        }
        if (monthlyPrice != null && monthlyPrice.signum() < 0) {
            throw new IllegalArgumentException("Valor mensal inválido.");
        }
        if (status == CoverageStatus.OPTIONAL && monthlyPrice == null) {
            throw new IllegalArgumentException("Serviços opcionais precisam de um valor mensal.");
        }

        this.status = status;
        this.detail = detail == null || detail.isBlank() ? null : detail.trim();
        this.monthlyPrice = status == CoverageStatus.OPTIONAL ? monthlyPrice : null;
        this.sortOrder = sortOrder;
    }

    public Long getId() { return id; }
    public Plan getPlan() { return plan; }
    public Coverage getCoverage() { return coverage; }
    public CoverageStatus getStatus() { return status; }
    public String getDetail() { return detail; }
    public BigDecimal getMonthlyPrice() { return monthlyPrice; }
    public Integer getSortOrder() { return sortOrder; }

    public void updateMonthlyPrice(BigDecimal monthlyPrice) {
        if (status != CoverageStatus.OPTIONAL) {
            throw new IllegalArgumentException("Somente benefícios opcionais possuem valor editável.");
        }
        if (monthlyPrice == null || monthlyPrice.signum() < 0) {
            throw new IllegalArgumentException("Valor mensal inválido.");
        }
        this.monthlyPrice = monthlyPrice;
    }
}
