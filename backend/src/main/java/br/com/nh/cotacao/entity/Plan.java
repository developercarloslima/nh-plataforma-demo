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

    public void updateAdmin(String name, String subtitle, Boolean active) {
        if (name != null) {
            if (name.isBlank()) throw new IllegalArgumentException("O nome do plano não pode ficar vazio.");
            this.name = name.trim();
        }
        if (subtitle != null) {
            this.subtitle = subtitle.isBlank() ? null : subtitle.trim();
        }
        if (active != null) {
            this.active = active;
        }
    }
}

