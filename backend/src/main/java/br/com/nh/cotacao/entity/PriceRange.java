package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "price_ranges")
public class PriceRange {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private Plan plan;

    @Column(name = "min_value", nullable = false, precision = 14, scale = 2)
    private BigDecimal minValue;

    @Column(name = "max_value", nullable = false, precision = 14, scale = 2)
    private BigDecimal maxValue;

    @Column(name = "monthly_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal monthlyPrice;

    protected PriceRange() {
    }

    public Long getId() { return id; }
    public Plan getPlan() { return plan; }
    public BigDecimal getMinValue() { return minValue; }
    public BigDecimal getMaxValue() { return maxValue; }
    public BigDecimal getMonthlyPrice() { return monthlyPrice; }
    public void updateMonthlyPrice(BigDecimal monthlyPrice) {
        if (monthlyPrice == null || monthlyPrice.signum() < 0) throw new IllegalArgumentException("Valor mensal inválido.");
        this.monthlyPrice = monthlyPrice;
    }
}
