package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "plans")
public class Plan {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 80)
    private String code;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 180)
    private String subtitle;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private VehicleCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Region region;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @Column(nullable = false)
    private Boolean active;

    @Column(name = "extra_above", precision = 14, scale = 2)
    private BigDecimal extraAbove;

    @Column(name = "extra_step", precision = 14, scale = 2)
    private BigDecimal extraStep;

    @Column(name = "extra_increment", precision = 14, scale = 2)
    private BigDecimal extraIncrement;

    @Column(name = "extra_base_price", precision = 14, scale = 2)
    private BigDecimal extraBasePrice;

    @Column(name = "tracker_required_above", precision = 14, scale = 2)
    private BigDecimal trackerRequiredAbove;

    @Column(name = "tracker_installation_fee", precision = 14, scale = 2)
    private BigDecimal trackerInstallationFee;

    @Column(name = "tracker_monthly_fee", precision = 14, scale = 2)
    private BigDecimal trackerMonthlyFee;

    @OneToMany(mappedBy = "plan", fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<PlanCoverage> coverages = new ArrayList<>();

    protected Plan() {
    }


    public static Plan create(
            String code,
            String name,
            String subtitle,
            VehicleCategory category,
            Region region,
            Integer displayOrder,
            Boolean active
    ) {
        Plan plan = new Plan();
        plan.code = requireText(code, "Código do plano");
        plan.name = requireText(name, "Nome do plano");
        plan.subtitle = cleanOptional(subtitle);
        plan.category = category;
        plan.region = region;
        plan.displayOrder = displayOrder == null ? 100 : Math.max(0, displayOrder);
        plan.active = active == null || active;
        return plan;
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getSubtitle() { return subtitle; }
    public VehicleCategory getCategory() { return category; }
    public Region getRegion() { return region; }
    public Integer getDisplayOrder() { return displayOrder; }
    public Boolean getActive() { return active; }
    public BigDecimal getExtraAbove() { return extraAbove; }
    public BigDecimal getExtraStep() { return extraStep; }
    public BigDecimal getExtraIncrement() { return extraIncrement; }
    public BigDecimal getExtraBasePrice() { return extraBasePrice; }
    public BigDecimal getTrackerRequiredAbove() { return trackerRequiredAbove; }
    public BigDecimal getTrackerInstallationFee() { return trackerInstallationFee; }
    public BigDecimal getTrackerMonthlyFee() { return trackerMonthlyFee; }
    public List<PlanCoverage> getCoverages() { return coverages; }

    public void updateAdmin(
            String name,
            String subtitle,
            VehicleCategory category,
            Region region,
            Integer displayOrder,
            Boolean active
    ) {
        if (name != null) this.name = requireText(name, "Nome do plano");
        if (subtitle != null) this.subtitle = cleanOptional(subtitle);
        if (category != null) this.category = category;
        if (region != null) this.region = region;
        if (displayOrder != null) {
            if (displayOrder < 0) throw new IllegalArgumentException("A ordem do plano deve ser zero ou maior.");
            this.displayOrder = displayOrder;
        }
        if (active != null) this.active = active;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " é obrigatório.");
        return value.trim();
    }

    private static String cleanOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

