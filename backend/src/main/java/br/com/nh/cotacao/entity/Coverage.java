package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "coverages")
public class Coverage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 80)
    private String code;

    @Column(nullable = false, length = 180)
    private String name;

    protected Coverage() {
    }

    public static Coverage create(String code, String name) {
        Coverage coverage = new Coverage();
        coverage.updateAdmin(code, name);
        return coverage;
    }

    public void updateAdmin(String code, String name) {
        this.code = requireText(code, "Código da cobertura");
        this.name = requireText(name, "Nome da cobertura");
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " é obrigatório.");
        }
        return value.trim();
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
}
