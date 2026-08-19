package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfFileSpecification;
import com.lowagie.text.pdf.PdfImportedPage;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class RetratoPdfService {
    private static final Color NAVY = new Color(8, 15, 99);
    private static final Color YELLOW = new Color(255, 204, 0);
    private static final Color LIGHT = new Color(244, 246, 252);
    private static final Color APPROVED_GREEN = new Color(24, 112, 68);
    private static final Color REJECTED_RED = new Color(158, 38, 38);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm");
    private static final DateTimeFormatter SIGNATURE_DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss XXX");
    private static final String ASSOCIATION_NAME = "ASSOCIAÇÃO DE PROTEÇÃO VEICULAR NOVO HORIZONTE";
    private static final String ASSOCIATION_CNPJ = "38.078.339/0001-83";
    private static final String ASSOCIATION_LOCATION = "Maceió/AL";

    private final InspectionAssetStorageService storageService;
    private final SiteDocumentService siteDocumentService;
    private final String supervisionResponsibleName;

    public RetratoPdfService(
            InspectionAssetStorageService storageService,
            SiteDocumentService siteDocumentService,
            @Value("${app.inspection-report.supervision-responsible-name:Eurides Macedo}") String supervisionResponsibleName
    ) {
        this.storageService = storageService;
        this.siteDocumentService = siteDocumentService;
        this.supervisionResponsibleName = supervisionResponsibleName == null || supervisionResponsibleName.isBlank()
                ? "Eurides Macedo"
                : supervisionResponsibleName.trim();
    }

    public byte[] generate(InspectionRequest request) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 38, 38, 38, 42);
            PdfWriter writer = PdfWriter.getInstance(document, output);
            document.open();

            addInspectionHeader(document);
            addInspectionData(document, request);
            addInspectionAssets(document, writer, request);

            Paragraph footer = new Paragraph(
                    "Relatório permanente do Retrato NH, sem prazo de validade. Os arquivos incorporados fazem parte deste dossiê digital.",
                    new Font(Font.HELVETICA, 8, Font.NORMAL, Color.GRAY)
            );
            footer.setSpacingBefore(12);
            footer.setAlignment(Element.ALIGN_CENTER);
            document.add(footer);

            if (isFinalDecision(request)) {
                SiteDocumentService.StoredDocument regulation = siteDocumentService.regulationFile();
                appendRegulation(document, writer, regulation);
                appendSupervisionDecision(document, request, regulation);
            }

            document.close();
            return output.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o relatório da vistoria.", exception);
        }
    }

    private void addInspectionHeader(Document document) throws DocumentException {
        PdfPTable header = new PdfPTable(new float[]{1, 3});
        header.setWidthPercentage(100);
        PdfPCell mark = new PdfPCell(new Phrase("NH", new Font(Font.HELVETICA, 24, Font.BOLD, Color.WHITE)));
        mark.setBackgroundColor(NAVY);
        mark.setHorizontalAlignment(Element.ALIGN_CENTER);
        mark.setVerticalAlignment(Element.ALIGN_MIDDLE);
        mark.setPadding(16);
        mark.setBorder(Rectangle.NO_BORDER);
        header.addCell(mark);

        PdfPCell title = new PdfPCell();
        title.setBackgroundColor(NAVY);
        title.setBorder(Rectangle.NO_BORDER);
        title.setPadding(12);
        title.addElement(new Phrase("RETRATO NH", new Font(Font.HELVETICA, 18, Font.BOLD, Color.WHITE)));
        title.addElement(new Phrase("Relatório de vistoria digital", new Font(Font.HELVETICA, 10, Font.NORMAL, YELLOW)));
        header.addCell(title);
        document.add(header);
        document.add(Chunk.NEWLINE);
    }

    private void addInspectionData(Document document, InspectionRequest request) throws DocumentException {
        PdfPTable data = new PdfPTable(new float[]{1, 2, 1, 2});
        data.setWidthPercentage(100);
        addPair(data, "Associado", request.getAssociateName());
        addPair(data, "Placa", request.getPlate() == null || request.getPlate().isBlank() ? "Veículo 0 km - sem placa" : request.getPlate());
        addPair(data, "CPF", maskCpf(request.getCpf()));
        addPair(data, "Consultor", request.getConsultantName());
        addPair(data, "Tipo", request.getRequestType().name().equals("NEW_INSPECTION") ? "Nova vistoria" : "Atualização de boleto");
        addPair(data, "Veículo", request.getVehicleType().displayName());
        addPair(data, "Criada em", request.getCreatedAt().format(DATE_TIME));
        if (request.getContractedPlan() != null && !request.getContractedPlan().isBlank()) {
            addFullWidthPair(data, "Plano já contratado", request.getContractedPlan());
        }
        if (request.getQuotation() != null && request.getQuotation().getDiscountPercent() > 0) {
            addPair(data, "Desconto da cotação", request.getQuotation().getDiscountPercent() + "%");
            String branding = request.getQuotation().getDiscountPercent() == 15
                    ? "Perfurado no vigia traseiro: NH + outra empresa"
                    : request.getQuotation().getDiscountPercent() == 30
                    ? "Perfurado no vigia traseiro: somente NH"
                    : "Não se aplica";
            addPair(data, "Condição do desconto", branding);
        }
        if (request.getResidenceAddress() != null && !request.getResidenceAddress().isBlank()) {
            addFullWidthPair(data, "Endereço residencial", request.getResidenceAddress());
        }
        if (isFinalDecision(request)) {
            addPair(data, "Decisão final", decisionLabel(request));
            addPair(data, "Supervisão responsável", supervisionResponsibleName);
        }
        document.add(data);
        document.add(Chunk.NEWLINE);
    }

    private void addInspectionAssets(Document document, PdfWriter writer, InspectionRequest request) throws Exception {
        Paragraph subtitle = new Paragraph("Arquivos enviados", new Font(Font.HELVETICA, 13, Font.BOLD, NAVY));
        subtitle.setSpacingAfter(8);
        document.add(subtitle);

        for (InspectionAsset asset : request.getAssets()) {
            if (asset.getAssetType() == InspectionAssetType.REPORT) continue;

            String contentType = asset.getContentType() == null
                    ? ""
                    : asset.getContentType().toLowerCase(Locale.ROOT);
            String fileName = asset.getFileName() == null || asset.getFileName().isBlank()
                    ? "arquivo-vistoria"
                    : asset.getFileName();

            if (!storageService.isAvailable(asset)) {
                document.add(new Paragraph(asset.getLabel() + " - arquivo original indisponível no momento da geração",
                        new Font(Font.HELVETICA, 9, Font.NORMAL, Color.DARK_GRAY)));
                continue;
            }

            try {
                byte[] bytes = storageService.readAll(asset.getId());

                // Fotos, documentos, assinatura e vídeo ficam incorporados ao próprio PDF.
                PdfFileSpecification attachment = PdfFileSpecification.fileEmbedded(
                        writer, null, fileName, bytes
                );
                writer.addFileAttachment(asset.getLabel(), attachment);

                if (contentType.startsWith("image/")) {
                    Image image = Image.getInstance(bytes);
                    image.scaleToFit(500, 320);
                    image.setAlignment(Image.ALIGN_CENTER);
                    if (asset.getAssetType() == InspectionAssetType.SIGNATURE) {
                        Paragraph signatureTitle = new Paragraph(
                                "Assinatura do associado",
                                new Font(Font.HELVETICA, 12, Font.BOLD, NAVY)
                        );
                        signatureTitle.setSpacingBefore(6);
                        signatureTitle.setSpacingAfter(6);
                        document.add(signatureTitle);
                    }
                    Paragraph imageLabel = new Paragraph(asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY));
                    imageLabel.setSpacingAfter(5);
                    document.add(imageLabel);
                    document.add(image);
                    document.add(Chunk.NEWLINE);
                    continue;
                }

                Paragraph fileBlock = new Paragraph(asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY));
                String typeLabel = asset.getAssetType() == InspectionAssetType.VIDEO || contentType.startsWith("video/")
                        ? "Vídeo anexado ao PDF"
                        : "Documento anexado ao PDF";
                fileBlock.add(new Chunk(
                        "\n" + typeLabel + ": " + fileName + " - " + humanSize(asset.getFileSize()),
                        new Font(Font.HELVETICA, 8, Font.NORMAL, Color.DARK_GRAY)
                ));
                fileBlock.setSpacingAfter(10);
                document.add(fileBlock);
            } catch (Exception exception) {
                document.add(new Paragraph(asset.getLabel() + " - não foi possível incorporar este arquivo ao relatório",
                        new Font(Font.HELVETICA, 9, Font.NORMAL, Color.DARK_GRAY)));
            }
        }
    }

    private void appendRegulation(
            Document document,
            PdfWriter writer,
            SiteDocumentService.StoredDocument regulation
    ) throws Exception {
        document.newPage();
        Paragraph sectionTitle = new Paragraph(
                "REGULAMENTO DO ASSOCIADO NH",
                new Font(Font.HELVETICA, 18, Font.BOLD, NAVY)
        );
        sectionTitle.setAlignment(Element.ALIGN_CENTER);
        sectionTitle.setSpacingAfter(12);
        document.add(sectionTitle);
        Paragraph description = new Paragraph(
                "O regulamento vigente na data da decisão da Supervisão integra este dossiê e também está incorporado como anexo do PDF.",
                new Font(Font.HELVETICA, 10, Font.NORMAL, Color.DARK_GRAY)
        );
        description.setAlignment(Element.ALIGN_CENTER);
        document.add(description);

        PdfFileSpecification regulationAttachment = PdfFileSpecification.fileEmbedded(
                writer, null, regulation.fileName(), regulation.bytes()
        );
        writer.addFileAttachment("Regulamento do Associado NH", regulationAttachment);

        PdfReader regulationReader = new PdfReader(regulation.bytes());
        try {
            for (int pageNumber = 1; pageNumber <= regulationReader.getNumberOfPages(); pageNumber++) {
                document.newPage();
                // Garante que a página seja materializada pelo Document antes do desenho absoluto.
                document.add(new Paragraph(" ", new Font(Font.HELVETICA, 1, Font.NORMAL, Color.WHITE)));

                Rectangle source = regulationReader.getPageSizeWithRotation(pageNumber);
                Rectangle target = PageSize.A4;
                float scale = Math.min(target.getWidth() / source.getWidth(), target.getHeight() / source.getHeight());
                float x = (target.getWidth() - source.getWidth() * scale) / 2f;
                float y = (target.getHeight() - source.getHeight() * scale) / 2f;

                PdfImportedPage imported = writer.getImportedPage(regulationReader, pageNumber);
                PdfContentByte canvas = writer.getDirectContent();
                canvas.addTemplate(imported, scale, 0, 0, scale, x, y);
            }
        } finally {
            regulationReader.close();
        }
    }

    private void appendSupervisionDecision(
            Document document,
            InspectionRequest request,
            SiteDocumentService.StoredDocument regulation
    ) throws Exception {
        document.newPage();

        Paragraph title = new Paragraph(
                "DECISÃO DA SUPERVISÃO DE ANÁLISE",
                new Font(Font.HELVETICA, 18, Font.BOLD, NAVY)
        );
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingAfter(14);
        document.add(title);

        Color decisionColor = request.getStatus() == InspectionRequestStatus.APPROVED ? APPROVED_GREEN : REJECTED_RED;
        PdfPTable decisionBadge = new PdfPTable(1);
        decisionBadge.setWidthPercentage(55);
        decisionBadge.setHorizontalAlignment(Element.ALIGN_CENTER);
        PdfPCell badge = new PdfPCell(new Phrase(decisionLabel(request), new Font(Font.HELVETICA, 20, Font.BOLD, Color.WHITE)));
        badge.setBackgroundColor(decisionColor);
        badge.setBorder(Rectangle.NO_BORDER);
        badge.setHorizontalAlignment(Element.ALIGN_CENTER);
        badge.setPadding(11);
        decisionBadge.addCell(badge);
        document.add(decisionBadge);
        document.add(Chunk.NEWLINE);

        String statement = "A vistoria do associado " + safe(request.getAssociateName()) + " foi analisada e "
                + (request.getStatus() == InspectionRequestStatus.APPROVED ? "APROVADA" : "REJEITADA")
                + " pela Supervisão de Análise responsável, " + supervisionResponsibleName + ".";
        Paragraph decisionStatement = new Paragraph(statement, new Font(Font.HELVETICA, 11, Font.NORMAL, Color.DARK_GRAY));
        decisionStatement.setAlignment(Element.ALIGN_JUSTIFIED);
        decisionStatement.setSpacingAfter(14);
        document.add(decisionStatement);

        PdfPTable details = new PdfPTable(new float[]{1.2f, 2.8f});
        details.setWidthPercentage(100);
        addDecisionRow(details, "Associado", request.getAssociateName());
        addDecisionRow(details, "Vistoria", request.getId().toString());
        addDecisionRow(details, "Placa", request.getPlate() == null || request.getPlate().isBlank() ? "Veículo 0 km - sem placa" : request.getPlate());
        addDecisionRow(details, "Status", decisionLabel(request));
        addDecisionRow(details, "Supervisão responsável", supervisionResponsibleName);
        addDecisionRow(details, "Decisão registrada por", safeReviewer(request));
        addDecisionRow(details, "Data e hora", request.getReviewedAt() == null ? "-" : request.getReviewedAt().format(SIGNATURE_DATE_TIME));
        addDecisionRow(details, "Observação", request.getAdminNote());
        document.add(details);
        document.add(Chunk.NEWLINE);

        addSignatureStyleBlock(document, request, regulation);

        Paragraph legalNote = new Paragraph(
                "Registro eletrônico interno de análise e decisão. O PDF preserva os arquivos da vistoria como anexos e incorpora o regulamento vigente utilizado no dossiê.",
                new Font(Font.HELVETICA, 8, Font.NORMAL, Color.GRAY)
        );
        legalNote.setAlignment(Element.ALIGN_CENTER);
        legalNote.setSpacingBefore(16);
        document.add(legalNote);
    }

    private void addSignatureStyleBlock(
            Document document,
            InspectionRequest request,
            SiteDocumentService.StoredDocument regulation
    ) throws Exception {
        PdfPTable signature = new PdfPTable(new float[]{1.15f, 1.85f});
        signature.setWidthPercentage(100);
        signature.setSpacingBefore(6);

        PdfPCell associationCell = new PdfPCell();
        associationCell.setBorderColor(new Color(218, 218, 218));
        associationCell.setPadding(12);
        associationCell.addElement(new Paragraph(ASSOCIATION_NAME, new Font(Font.HELVETICA, 14, Font.BOLD, Color.BLACK)));
        associationCell.addElement(new Paragraph("CNPJ: " + ASSOCIATION_CNPJ, new Font(Font.HELVETICA, 10, Font.NORMAL, Color.BLACK)));
        associationCell.addElement(new Paragraph("Local: " + ASSOCIATION_LOCATION, new Font(Font.HELVETICA, 9, Font.NORMAL, Color.DARK_GRAY)));
        signature.addCell(associationCell);

        PdfPCell auditCell = new PdfPCell();
        auditCell.setBackgroundColor(LIGHT);
        auditCell.setBorderColor(new Color(218, 218, 218));
        auditCell.setPadding(12);
        auditCell.addElement(new Paragraph("REGISTRO DIGITAL DE ANÁLISE E DECISÃO", new Font(Font.HELVETICA, 10, Font.BOLD, NAVY)));
        auditCell.addElement(signatureLine("Documento", "Relatório final da vistoria + Regulamento do Associado NH"));
        auditCell.addElement(signatureLine("Resultado", decisionLabel(request)));
        auditCell.addElement(signatureLine("Supervisão responsável", supervisionResponsibleName));
        auditCell.addElement(signatureLine("Registrado por", safeReviewer(request)));
        auditCell.addElement(signatureLine("Data", request.getReviewedAt() == null ? "-" : request.getReviewedAt().format(SIGNATURE_DATE_TIME)));
        auditCell.addElement(signatureLine("Razão", request.getAdminNote() == null || request.getAdminNote().isBlank()
                ? "Análise de vistoria realizada pela Supervisão responsável"
                : request.getAdminNote()));
        auditCell.addElement(signatureLine("Hash SHA-256 do registro", decisionHash(request, regulation)));
        signature.addCell(auditCell);

        document.add(signature);
    }

    private Paragraph signatureLine(String label, String value) {
        Paragraph paragraph = new Paragraph();
        paragraph.setSpacingBefore(3);
        paragraph.add(new Chunk(label + ": ", new Font(Font.HELVETICA, 8, Font.BOLD, Color.BLACK)));
        paragraph.add(new Chunk(value == null || value.isBlank() ? "-" : value, new Font(Font.HELVETICA, 8, Font.NORMAL, Color.BLACK)));
        return paragraph;
    }

    private void addDecisionRow(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, new Font(Font.HELVETICA, 9, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);

        PdfPCell valueCell = new PdfPCell(new Phrase(value == null || value.isBlank() ? "-" : value, new Font(Font.HELVETICA, 9)));
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private boolean isFinalDecision(InspectionRequest request) {
        return request.getStatus() == InspectionRequestStatus.APPROVED
                || request.getStatus() == InspectionRequestStatus.REJECTED;
    }

    private String decisionLabel(InspectionRequest request) {
        return request.getStatus() == InspectionRequestStatus.APPROVED ? "APROVADA" : "REJEITADA";
    }

    private String safeReviewer(InspectionRequest request) {
        if (request.getReviewedByName() != null && !request.getReviewedByName().isBlank()) {
            return request.getReviewedByName();
        }
        return supervisionResponsibleName;
    }

    private String decisionHash(InspectionRequest request, SiteDocumentService.StoredDocument regulation) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        String payload = request.getId() + "|"
                + request.getStatus() + "|"
                + (request.getReviewedAt() == null ? "" : request.getReviewedAt()) + "|"
                + supervisionResponsibleName + "|"
                + safeReviewer(request) + "|"
                + safe(request.getAdminNote()) + "|"
                + regulation.fileName() + "|"
                + regulation.fileSize();
        digest.update(payload.getBytes(StandardCharsets.UTF_8));
        digest.update(regulation.bytes());
        String hash = HexFormat.of().withUpperCase().formatHex(digest.digest());
        return hash.replaceAll("(.{16})(?!$)", "$1 ");
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private void addPair(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, new Font(Font.HELVETICA, 8, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);
        PdfPCell valueCell = new PdfPCell(new Phrase(value == null ? "-" : value, new Font(Font.HELVETICA, 9)));
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private void addFullWidthPair(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, new Font(Font.HELVETICA, 8, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);
        PdfPCell valueCell = new PdfPCell(new Phrase(value == null ? "-" : value, new Font(Font.HELVETICA, 9)));
        valueCell.setColspan(3);
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private String humanSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format(Locale.ROOT, "%.1f KB", kb);
        return String.format(Locale.ROOT, "%.1f MB", kb / 1024.0);
    }

    private String maskCpf(String cpf) {
        if (cpf == null || cpf.length() != 11) return "***.***.***-**";
        return "***." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-**";
    }
}
