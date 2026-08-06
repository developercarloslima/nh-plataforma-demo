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
        Quotation quotation = Quotation.createForConsultant(
                "NH-2026-TESTE0KM",
                consultant,
                "Cliente",
                "52998224725",
                "82999999999",
                "ABC1D23",
                "Veículo zero",
                2026,
                true,
                new BigDecimal("90000.00"),
                "CAR_NATIONAL",
                Region.NATIONAL,
                null,
                "CAR_COMPLETO",
                "Plano Completo",
                new BigDecimal("200.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null
        );

        assertTrue(quotation.isZeroKm());
    }

    @Test
    void shouldAllowZeroKilometerVehicleWithoutPlate() {
        Consultant consultant = Consultant.create("Consultor", "TEST");
        Quotation quotation = Quotation.createForConsultant(
                "NH-2026-SEMPLACA",
                consultant,
                "Cliente",
                "52998224725",
                "82999999999",
                null,
                "Veículo zero",
                2026,
                true,
                new BigDecimal("90000.00"),
                "CAR_NATIONAL",
                Region.NATIONAL,
                null,
                "CAR_COMPLETO",
                "Plano Completo",
                new BigDecimal("200.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null
        );

        assertTrue(quotation.isZeroKm());
        assertNull(quotation.getPlate());
    }


    @Test
    void shouldAssignSelfServiceQuoteAndInspectionToConsultant() {
        Consultant consultant = Consultant.create("Jose Consultor", "TEST");
        Quotation quotation = Quotation.createSelfService(
                "NH-2026-PUBLICA001",
                consultant,
                "Cliente Público",
                "52998224725",
                "82999999999",
                "ABC1D23",
                "Veículo teste",
                2025,
                false,
                new BigDecimal("50000.00"),
                "CAR_NATIONAL",
                Region.NATIONAL,
                null,
                "CAR_ECONOMICO",
                "Plano Econômico",
                new BigDecimal("100.00"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null
        );

        InspectionRequest inspection = InspectionRequest.createForSelfServiceQuote("token-publico", quotation);

        assertEquals(consultant.getId(), quotation.getConsultant().getId());
        assertEquals(consultant.getName(), quotation.getConsultantName());
        assertEquals(consultant.getId(), inspection.getConsultant().getId());
        assertEquals(consultant.getName(), inspection.getConsultantName());
        assertEquals(InspectionRequestStatus.WAITING_FILES, inspection.getStatus());
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> inspection.adminReview(InspectionRequestStatus.APPROVED, "Aprovação indevida")
        );
        assertTrue(error.getMessage().contains("Aguardando arquivos"));
    }

    private Quotation quotationWithBaseValue(String baseValue) {
        Consultant consultant = Consultant.create("Consultor", "TEST");
        return Quotation.createForConsultant(
                "NH-2026-TESTE001",
                consultant,
                "Cliente",
                "52998224725",
                "82999999999",
                "ABC1D23",
                "Veículo teste",
                2025,
                false,
                new BigDecimal("50000.00"),
                "CAR_NATIONAL",
                Region.NATIONAL,
                null,
                "CAR_ECONOMICO",
                "Plano Econômico",
                new BigDecimal(baseValue),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null
        );
    }
}
