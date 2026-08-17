package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "consultants")
public class Consultant {
    @Id
    private UUID id;

    @Column(nullable = false, length = 140)
    private String name;

    @Column(name = "normalized_name", nullable = false, unique = true, length = 160)
    private String normalizedName;

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false, length = 30)
    private String source;

    @Enumerated(EnumType.STRING)
    @Column(name = "collaborator_role", nullable = false, length = 20)
    private CollaboratorRole role;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "last_portal_login_at")
    private OffsetDateTime lastPortalLoginAt;

    protected Consultant() {}

    public static Consultant create(String name, String source) {
        return create(name, source, CollaboratorRole.CONSULTANT);
    }

    public static Consultant create(String name, String source, CollaboratorRole role) {
        String clean = cleanName(name);
        Consultant consultant = new Consultant();
        consultant.id = UUID.randomUUID();
        consultant.name = clean;
        consultant.normalizedName = normalize(clean);
        consultant.active = true;
        consultant.source = source;
        consultant.role = role == null ? CollaboratorRole.CONSULTANT : role;
        consultant.createdAt = OffsetDateTime.now();
        consultant.updatedAt = consultant.createdAt;
        return consultant;
    }

    public void setActive(boolean active) {
        this.active = active;
        this.updatedAt = OffsetDateTime.now();
    }

    public void rename(String name) {
        String clean = cleanName(name);
        this.name = clean;
        this.normalizedName = normalize(clean);
        this.updatedAt = OffsetDateTime.now();
    }

    public void setRole(CollaboratorRole role) {
        if (role == null) throw new IllegalArgumentException("Informe a função do colaborador.");
        this.role = role;
        this.updatedAt = OffsetDateTime.now();
    }

    public void registerPortalLogin() {
        OffsetDateTime now = OffsetDateTime.now();
        this.lastPortalLoginAt = now;
        this.updatedAt = now;
    }

    public static String normalize(String value) {
        String withoutAccents = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        return withoutAccents.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .trim()
                .replaceAll("\\s+", " ");
    }

    private static String cleanName(String name) {
        if (name == null) throw new IllegalArgumentException("Informe o nome do colaborador.");
        String clean = name.trim().replaceAll("\\s+", " ");
        if (clean.length() < 3 || clean.length() > 140) {
            throw new IllegalArgumentException("O nome do colaborador deve ter entre 3 e 140 caracteres.");
        }
        return clean.toUpperCase(Locale.forLanguageTag("pt-BR"));
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getNormalizedName() { return normalizedName; }
    public boolean isActive() { return active; }
    public String getSource() { return source; }
    public CollaboratorRole getRole() { return role; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public OffsetDateTime getLastPortalLoginAt() { return lastPortalLoginAt; }
}
