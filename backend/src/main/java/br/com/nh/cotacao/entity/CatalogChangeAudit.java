package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "catalog_change_audit")
public class CatalogChangeAudit {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "item_type", nullable = false, length = 30)
    private String itemType;

    @Column(name = "item_id", nullable = false)
    private Long itemId;

    @Column(nullable = false, length = 260)
    private String description;

    @Column(name = "old_value", precision = 14, scale = 2)
    private BigDecimal oldValue;

    @Column(name = "new_value", precision = 14, scale = 2)
    private BigDecimal newValue;

    @Column(name = "old_text", length = 500)
    private String oldText;

    @Column(name = "new_text", length = 500)
    private String newText;

    @Column(name = "changed_by", nullable = false, length = 160)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private OffsetDateTime changedAt;

    protected CatalogChangeAudit() {}

    public static CatalogChangeAudit create(
            String type,
            Long id,
            String description,
            BigDecimal oldValue,
            BigDecimal newValue,
            String changedBy
    ) {
        CatalogChangeAudit audit = base(type, id, description, changedBy);
        audit.oldValue = oldValue;
        audit.newValue = newValue;
        return audit;
    }

    public static CatalogChangeAudit createText(
            String type,
            Long id,
            String description,
            String oldText,
            String newText,
            String changedBy
    ) {
        CatalogChangeAudit audit = base(type, id, description, changedBy);
        audit.oldText = truncate(oldText);
        audit.newText = truncate(newText);
        return audit;
    }

    private static CatalogChangeAudit base(String type, Long id, String description, String changedBy) {
        CatalogChangeAudit audit = new CatalogChangeAudit();
        audit.itemType = type;
        audit.itemId = id;
        audit.description = description;
        audit.changedBy = changedBy;
        audit.changedAt = OffsetDateTime.now();
        return audit;
    }

    private static String truncate(String value) {
        if (value == null) return null;
        return value.length() <= 500 ? value : value.substring(0, 500);
    }

    public Long getId() { return id; }
    public String getItemType() { return itemType; }
    public Long getItemId() { return itemId; }
    public String getDescription() { return description; }
    public BigDecimal getOldValue() { return oldValue; }
    public BigDecimal getNewValue() { return newValue; }
    public String getOldText() { return oldText; }
    public String getNewText() { return newText; }
    public String getChangedBy() { return changedBy; }
    public OffsetDateTime getChangedAt() { return changedAt; }
}
