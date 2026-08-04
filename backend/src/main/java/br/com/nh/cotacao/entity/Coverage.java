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

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
}
