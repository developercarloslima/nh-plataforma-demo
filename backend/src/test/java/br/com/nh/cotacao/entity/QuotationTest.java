package br.com.nh.cotacao.entity;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class QuotationTest {

    @Test
    void shouldOnlyAddSelectedOptionalsToMonthlyTotal() {
        Quotation quotation = quotationWithBaseValue("100.00");

        assertEquals(new BigDecimal("100.00"), quotation.getMonthlyValue());
        assertTrue(quotation.getSelectedOptionals().isEmpty());

        quotation.addOptional(
                "FUNERAL",
                "Auxílio funeral individual",
                "R$ 3.000,00 para o associado",
                new BigDecimal("5.00")
        );

        assertEquals(new BigDecimal("105.00"), quotation.getMonthlyValue());
        assertEquals(1, quotation.getSelectedOptionals().size());
    }

    @Test
    void shouldRejectDuplicatedOptional() {
        Quotation quotation = quotationWithBaseValue("100.00");
        quotation.addOptional("FUNERAL", "Auxílio funeral", null, new BigDecimal("5.00"));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> quotation.addOptional("FUNERAL", "Auxílio funeral", null, new BigDecimal("5.00"))
        );

        assertEquals("O mesmo opcional não pode ser selecionado mais de uma vez.", error.getMessage());
        assertEquals(new BigDecimal("105.00"), quotation.getMonthlyValue());
    }


    @Test
    void shouldRegisterInspectionPhotosAndFinalDocument() {
        Quotation quotation = quotationWithBaseValue("100.00");
        quotation.decide(QuoteStatus.ACCEPTED);
        quotation.registerDriveFolder("folder-1", "https://drive.google.com/folder-1");
        quotation.addInspectionPhoto(
                "Frente do veículo",
                "01 - Frente do veículo.jpg",
                "image/jpeg",
                1024,
                1,
                "photo-1",
                "https://drive.google.com/photo-1"
        );
        quotation.completeInspection("pdf-1", "https://drive.google.com/pdf-1");

        assertEquals(1, quotation.getInspectionPhotos().size());
        assertNotNull(quotation.getInspectionCompletedAt());
        assertEquals("https://drive.google.com/folder-1", quotation.getDriveFolderUrl());
        assertEquals("https://drive.google.com/pdf-1", quotation.getDrivePdfUrl());
    }

    @Test
    void shouldClearPreviousPhotosBeforeAReplacementInspection() {
        Quotation quotation = quotationWithBaseValue("100.00");
        quotation.addInspectionPhoto(
                "Frente do veículo",
                "01.jpg",
                "image/jpeg",
                1024,
                1,
                "photo-1",
                "https://drive.google.com/photo-1"
        );
        quotation.completeInspection("pdf-1", "https://drive.google.com/pdf-1");

        quotation.replaceInspectionPhotos();

        assertTrue(quotation.getInspectionPhotos().isEmpty());
        assertNull(quotation.getInspectionCompletedAt());
    }

    @Test
    void shouldStoreZeroKilometerInformation() {
        Consultant consultant = Consultant.create("Consultor", "TEST");
        Quotation quotation = Quotation.create(
                "NH-2026-TESTE0KM",
                consultant,
                "Cliente",
                "82999999999",
                "ABC1D23",
                "Veículo zero",
                2026,
                true,
                new BigDecimal("90000.00"),
                "CAR_NATIONAL",
                Region.NATIONAL,
                "CAR_COMPLETO",
                "Plano Completo",
                new BigDecimal("200.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null
        );

        assertTrue(quotation.isZeroKm());
    }

    private Quotation quotationWithBaseValue(String baseValue) {
        Consultant consultant = Consultant.create("Consultor", "TEST");
        return Quotation.create(
                "NH-2026-TESTE001",
                consultant,
                "Cliente",
                "82999999999",
                "ABC1D23",
                "Veículo teste",
                2025,
                false,
                new BigDecimal("50000.00"),
                "CAR_NATIONAL",
                Region.NATIONAL,
                "CAR_ECONOMICO",
                "Plano Econômico",
                new BigDecimal(baseValue),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null
        );
    }
}
