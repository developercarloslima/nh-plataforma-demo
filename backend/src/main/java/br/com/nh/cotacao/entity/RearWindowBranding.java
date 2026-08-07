package br.com.nh.cotacao.entity;

public enum RearWindowBranding {
    NOT_APPLICABLE("Não se aplica"),
    NH_AND_OTHER_COMPANY("Perfurado com Novo Horizonte + outra empresa"),
    NH_ONLY("Perfurado somente com a logomarca Novo Horizonte");

    private final String displayName;

    RearWindowBranding(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
