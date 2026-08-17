package br.com.nh.cotacao.entity;

import br.com.nh.cotacao.security.PortalRole;
import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "portal_users")
public class PortalUser {
    @Id
    private UUID id;

    @Column(nullable = false, length = 160)
    private String username;

    @Column(name = "normalized_username", nullable = false, unique = true, length = 160)
    private String normalizedUsername;

    @Column(name = "display_name", length = 160)
    private String displayName;

    @Column(name = "password_hash", nullable = false, length = 120)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PortalRole role;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "password_changed_at", nullable = false)
    private OffsetDateTime passwordChangedAt;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    @Column(name = "created_by", length = 160)
    private String createdBy;

    @Column(name = "consultant_id")
    private UUID consultantId;

    protected PortalUser() {}

    public static PortalUser create(
            String username,
            String displayName,
            String passwordHash,
            PortalRole role,
            String createdBy
    ) {
        PortalUser user = new PortalUser();
        user.id = UUID.randomUUID();
        user.setUsernameInternal(username);
        user.displayName = cleanOptional(displayName, 160);
        user.passwordHash = requireHash(passwordHash);
        user.role = requireRole(role);
        user.active = true;
        user.createdAt = OffsetDateTime.now();
        user.updatedAt = user.createdAt;
        user.passwordChangedAt = user.createdAt;
        user.createdBy = cleanOptional(createdBy, 160);
        return user;
    }

    public void updateProfile(String username, String displayName, PortalRole role) {
        if (username != null && !username.isBlank()) setUsernameInternal(username);
        if (displayName != null) this.displayName = cleanOptional(displayName, 160);
        if (role != null) this.role = requireRole(role);
        this.updatedAt = OffsetDateTime.now();
    }

    public void linkConsultant(UUID consultantId) {
        this.consultantId = consultantId;
        this.updatedAt = OffsetDateTime.now();
    }

    public void changePassword(String passwordHash) {
        this.passwordHash = requireHash(passwordHash);
        this.passwordChangedAt = OffsetDateTime.now();
        this.updatedAt = this.passwordChangedAt;
    }

    public void setActive(boolean active) {
        this.active = active;
        this.updatedAt = OffsetDateTime.now();
    }

    public void registerLogin() {
        OffsetDateTime now = OffsetDateTime.now();
        this.lastLoginAt = now;
        this.updatedAt = now;
    }

    private void setUsernameInternal(String username) {
        String clean = username == null ? "" : username.trim();
        if (clean.length() < 3 || clean.length() > 160) {
            throw new IllegalArgumentException("O usuário deve ter entre 3 e 160 caracteres.");
        }
        if (clean.chars().anyMatch(Character::isWhitespace)) {
            throw new IllegalArgumentException("O usuário não pode conter espaços.");
        }
        this.username = clean;
        this.normalizedUsername = normalizeUsername(clean);
    }

    public static String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private static String requireHash(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Hash de senha inválido.");
        return value;
    }

    private static PortalRole requireRole(PortalRole role) {
        if (role == null) throw new IllegalArgumentException("Informe o perfil de acesso.");
        return role;
    }

    private static String cleanOptional(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String clean = value.trim().replaceAll("\\s+", " ");
        return clean.substring(0, Math.min(max, clean.length()));
    }

    public UUID getId() { return id; }
    public String getUsername() { return username; }
    public String getNormalizedUsername() { return normalizedUsername; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public PortalRole getRole() { return role; }
    public boolean isActive() { return active; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public OffsetDateTime getPasswordChangedAt() { return passwordChangedAt; }
    public OffsetDateTime getLastLoginAt() { return lastLoginAt; }
    public String getCreatedBy() { return createdBy; }
    public UUID getConsultantId() { return consultantId; }
}
