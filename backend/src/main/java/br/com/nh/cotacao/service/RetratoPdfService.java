package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.CoverageStatus;
import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.Quotation;
import br.com.nh.cotacao.entity.QuotationOptionalCoverage;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfFileSpecification;
import com.lowagie.text.pdf.PdfDictionary;
import com.lowagie.text.pdf.PdfImportedPage;
import com.lowagie.text.pdf.PdfName;
import com.lowagie.text.pdf.PdfNameTree;
import com.lowagie.text.pdf.PdfObject;
import com.lowagie.text.pdf.PRStream;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfString;
import com.lowagie.text.pdf.PdfStamper;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import java.awt.Color;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class RetratoPdfService {
    private static final Color NAVY = new Color(8, 15, 99);
    private static final Color NAVY_LIGHT = new Color(20, 31, 139);
    private static final Color YELLOW = new Color(255, 236, 0);
    private static final Color TEXT = new Color(28, 31, 48);
    private static final Color MUTED = new Color(95, 101, 119);
    private static final Color LIGHT = new Color(246, 247, 252);
    private static final Color LINE = new Color(220, 224, 234);
    private static final Color APPROVED_GREEN = new Color(24, 112, 68);
    private static final Color REJECTED_RED = new Color(158, 38, 38);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm");
    private static final DateTimeFormatter SIGNATURE_DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss XXX");
    private static final String ASSOCIATION_NAME = "ASSOCIAÇÃO DE PROTEÇÃO VEICULAR NOVO HORIZONTE";
    private static final String ASSOCIATION_CNPJ = "38.078.339/0001-83";
    private static final String ASSOCIATION_LOCATION = "Maceió/AL";
    public static final String REPORT_LAYOUT_VERSION = "NH_RETRATO_LAYOUT_V47";
    private static final int PHOTO_GRID_COLUMNS = 3;
    private static final int DOCUMENT_GRID_COLUMNS = 2;
    private static final float PAGE_FOOTER_TOP = 82f;

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
            Document document = new Document(PageSize.A4, 36, 36, 42, 94);
            PdfWriter writer = PdfWriter.getInstance(document, output);
            document.addTitle("Relatório de vistoria " + request.getId() + " - Novo Horizonte");
            document.addAuthor("Novo Horizonte Proteção Veicular");
            document.addSubject("Dossiê digital da vistoria - layout padronizado Novo Horizonte");
            document.addKeywords(REPORT_LAYOUT_VERSION);
            document.open();

            addHeader(document, request);
            addInspectionData(document, request);
            addPlanAndBenefits(document, request);
            addInspectionAssets(document, writer, request);
            addPermanentFooterNote(document);

            if (isFinalDecision(request)) {
                SiteDocumentService.StoredDocument regulation = siteDocumentService.regulationFile();
                appendSupervisionDecision(document, request, regulation);
                appendRegulation(document, writer, regulation);
            }

            document.close();
            return stampRequiredSignaturesOnEveryPage(request, output.toByteArray(), null);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o relatório da vistoria.", exception);
        }
    }

    public boolean isCurrentLayout(byte[] pdfBytes) {
        if (pdfBytes == null || pdfBytes.length == 0) return false;
        PdfReader reader = null;
        try {
            reader = new PdfReader(pdfBytes);
            String keywords = reader.getInfo().get("Keywords");
            return keywords != null && keywords.contains(REPORT_LAYOUT_VERSION);
        } catch (Exception ignored) {
            return false;
        } finally {
            if (reader != null) reader.close();
        }
    }

    /**
     * Compatibilidade para dossiês históricos cujos arquivos individuais já saíram
     * da retenção operacional. Criamos uma capa/decisão no layout atual e preservamos
     * integralmente o PDF histórico como anexo visual, aplicando o rodapé padronizado
     * e as miniaturas/selos de assinatura em todas as páginas do novo documento.
     */
    public byte[] standardizeLegacyReport(InspectionRequest request, byte[] legacyReport) {
        if (legacyReport == null || legacyReport.length == 0) {
            return generate(request);
        }
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 42, 94);
            PdfWriter writer = PdfWriter.getInstance(document, output);
            document.addTitle("Relatório padronizado de vistoria " + request.getId() + " - Novo Horizonte");
            document.addAuthor("Novo Horizonte Proteção Veicular");
            document.addSubject("Dossiê histórico padronizado da vistoria");
            document.addKeywords(REPORT_LAYOUT_VERSION + ";LEGACY_STANDARDIZED");
            document.open();

            addHeader(document, request);
            addInspectionData(document, request);
            addPlanAndBenefits(document, request);

            List<LegacyAttachment> recoveredAttachments = extractEmbeddedAttachments(legacyReport);
            boolean recoveredSourceFiles = addRecoveredLegacyAssets(document, writer, recoveredAttachments);
            if (!recoveredSourceFiles) {
                document.add(sectionTitle("ARQUIVOS E DOSSIÊ HISTÓRICO"));
                Paragraph preserved = new Paragraph(
                        "Os arquivos individuais desta vistoria não estão mais disponíveis na retenção operacional e o PDF histórico não possui anexos extraíveis. "
                                + "O dossiê consolidado originalmente preservado será incorporado integralmente nas páginas finais, sem alterar o conteúdo histórico.",
                        font(9, Font.NORMAL, MUTED)
                );
                preserved.setSpacingAfter(10);
                document.add(preserved);
            }
            addPermanentFooterNote(document);

            if (isFinalDecision(request)) {
                SiteDocumentService.StoredDocument regulation = siteDocumentService.regulationFile();
                appendSupervisionDecision(document, request, regulation);
                appendRegulation(document, writer, regulation);
            }

            if (!recoveredSourceFiles) {
                appendLegacyAnnex(document, writer, legacyReport);
            }
            document.close();
            return stampRequiredSignaturesOnEveryPage(request, output.toByteArray(), legacyReport);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível padronizar o dossiê histórico da vistoria.", exception);
        }
    }

    private void addHeader(Document document, InspectionRequest request) throws Exception {
        PdfPTable banner = new PdfPTable(new float[]{1.05f, 4.35f, 1.7f});
        banner.setWidthPercentage(100);
        banner.setSpacingAfter(18);

        PdfPCell logoCell;
        try (InputStream logoStream = new ClassPathResource("favicon-nh.png").getInputStream()) {
            Image logo = Image.getInstance(logoStream.readAllBytes());
            logo.scaleToFit(66, 66);
            logoCell = new PdfPCell(logo, false);
        }
        styleBannerCell(logoCell);
        logoCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        logoCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        banner.addCell(logoCell);

        Paragraph title = new Paragraph();
        title.setAlignment(Element.ALIGN_CENTER);
        title.setLeading(25);
        title.add(new Chunk("NOVO HORIZONTE\n", font(28, Font.BOLD, Color.WHITE)));
        title.add(new Chunk("PROTEÇÃO VEICULAR\n", font(11, Font.BOLD, YELLOW)));
        title.add(new Chunk("RELATÓRIO DE VISTORIA DIGITAL", font(10.5f, Font.NORMAL, Color.WHITE)));
        PdfPCell titleCell = new PdfPCell(title);
        styleBannerCell(titleCell);
        titleCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        titleCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        banner.addCell(titleCell);

        Paragraph identifier = new Paragraph();
        identifier.setAlignment(Element.ALIGN_RIGHT);
        identifier.setLeading(14);
        identifier.add(new Chunk("Nº DA VISTORIA\n", font(7, Font.BOLD, YELLOW)));
        identifier.add(new Chunk(shortInspectionId(request) + "\n", font(8.5f, Font.BOLD, Color.WHITE)));
        identifier.add(new Chunk("STATUS\n", font(7, Font.BOLD, YELLOW)));
        identifier.add(new Chunk(headerStatusLabel(request), font(7.5f, Font.BOLD, Color.WHITE)));
        PdfPCell identifierCell = new PdfPCell(identifier);
        styleBannerCell(identifierCell);
        identifierCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        banner.addCell(identifierCell);

        document.add(banner);

        PdfPTable intro = new PdfPTable(new float[]{4.5f, 1.5f});
        intro.setWidthPercentage(100);
        PdfPCell introText = new PdfPCell(new Phrase(
                "Dossiê digital permanente da vistoria com anexos, decisão da supervisão e regulamento",
                font(14.5f, Font.BOLD, NAVY)
        ));
        introText.setBorder(Rectangle.NO_BORDER);
        introText.setPaddingBottom(5);
        intro.addCell(introText);

        PdfPCell status = new PdfPCell(new Phrase(headerStatusLabel(request), font(8, Font.BOLD, NAVY)));
        status.setHorizontalAlignment(Element.ALIGN_CENTER);
        status.setVerticalAlignment(Element.ALIGN_MIDDLE);
        status.setBackgroundColor(YELLOW);
        status.setBorderColor(YELLOW);
        status.setPadding(7);
        intro.addCell(status);
        document.add(intro);

        Paragraph subtitle = new Paragraph(
                isFinalDecision(request)
                        ? "Relatório definitivo da vistoria com decisão final da Supervisão de Análise e regulamento vigente incorporado ao PDF."
                        : "Relatório parcial da vistoria com os arquivos enviados até o momento. A decisão final da Supervisão será incorporada quando a análise for concluída.",
                font(8.5f, Font.NORMAL, MUTED)
        );
        subtitle.setSpacingAfter(16);
        document.add(subtitle);
    }

    private void addInspectionData(Document document, InspectionRequest request) throws DocumentException {
        document.add(sectionTitle("DADOS DA VISTORIA E DO ASSOCIADO"));

        PdfPTable table = new PdfPTable(new float[]{1.15f, 2.35f, 1.15f, 2.35f});
        table.setWidthPercentage(100);
        table.setSpacingAfter(16);

        addLabelValue(table, "Associado", request.getAssociateName());
        addLabelValue(table, "Consultor", request.getConsultantName());
        addLabelValue(table, "CPF", formatCpf(request.getCpf()));
        addLabelValue(table, "Placa", request.getPlate() == null || request.getPlate().isBlank() ? "Veículo 0 km - sem placa" : request.getPlate());
        addLabelValue(table, "Tipo", request.getRequestType().name().equals("NEW_INSPECTION") ? "Nova vistoria" : "Atualização de boleto");
        addLabelValue(table, "Veículo", request.getVehicleType().displayName());
        addLabelValue(table, "Criada em", request.getCreatedAt() == null ? "-" : request.getCreatedAt().format(DATE_TIME));
        addLabelValue(table, "Vistoria", shortInspectionId(request));
        if (request.getResidenceAddress() != null && !request.getResidenceAddress().isBlank()) {
            addWideLabelValue(table, "Endereço residencial", request.getResidenceAddress());
        }
        if (request.getContractedPlan() != null && !request.getContractedPlan().isBlank()) {
            addWideLabelValue(table, "Plano já contratado", request.getContractedPlan());
        }
        if (request.getQuotation() != null && request.getQuotation().getDiscountPercent() > 0) {
            addLabelValue(table, "Desconto da cotação", request.getQuotation().getDiscountPercent() + "%");
            String branding = request.getQuotation().getDiscountPercent() == 15
                    ? "Perfurado no vigia traseiro: NH + outra empresa"
                    : request.getQuotation().getDiscountPercent() == 30
                    ? "Perfurado no vigia traseiro: somente NH"
                    : "Não se aplica";
            addLabelValue(table, "Condição do desconto", branding);
        }
        if (isFinalDecision(request)) {
            addLabelValue(table, "Decisão final", decisionLabel(request));
            addLabelValue(table, "Supervisão responsável", effectiveSupervisionResponsibleName(request));
        }
        document.add(table);
    }

    private void addPlanAndBenefits(Document document, InspectionRequest request) throws DocumentException {
        Quotation quotation = request.getQuotation();
        if (quotation == null) {
            if (request.getContractedPlan() != null && !request.getContractedPlan().isBlank()) {
                document.add(sectionTitle("PLANO CONTRATADO"));
                PdfPTable plan = new PdfPTable(new float[]{1.3f, 3.7f});
                plan.setWidthPercentage(100);
                plan.setSpacingAfter(16);
                addDecisionRow(plan, "Plano", request.getContractedPlan());
                document.add(plan);
            }
            return;
        }

        document.add(sectionTitle("PLANO, BENEFÍCIOS E DETALHES CONTRATADOS"));

        PdfPTable summary = new PdfPTable(new float[]{3.7f, 1.8f});
        summary.setWidthPercentage(100);

        Paragraph planText = new Paragraph();
        planText.setLeading(17);
        planText.add(new Chunk(safeValue(quotation.getSelectedPlanName(), "Plano contratado") + "\n", font(14, Font.BOLD, NAVY)));
        String secondLine = safeValue(quotation.getSelectedPlanCode(), "Sem código") + " • Cotação " + safeValue(quotation.getQuoteNumber(), "-");
        planText.add(new Chunk(secondLine, font(8.5f, Font.NORMAL, MUTED)));
        PdfPCell planCell = new PdfPCell(planText);
        planCell.setPadding(13);
        planCell.setBackgroundColor(LIGHT);
        planCell.setBorderColor(LINE);
        summary.addCell(planCell);

        Paragraph totalMonthly = new Paragraph();
        totalMonthly.setAlignment(Element.ALIGN_CENTER);
        totalMonthly.setLeading(18);
        totalMonthly.add(new Chunk(formatCurrency(quotation.getMonthlyValue()) + "\n", font(17, Font.BOLD, NAVY)));
        totalMonthly.add(new Chunk("TOTAL MENSAL", font(7.5f, Font.BOLD, NAVY)));
        PdfPCell totalCell = new PdfPCell(totalMonthly);
        totalCell.setPadding(11);
        totalCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        totalCell.setBackgroundColor(YELLOW);
        totalCell.setBorderColor(YELLOW);
        summary.addCell(totalCell);
        document.add(summary);

        PdfPTable planDetails = new PdfPTable(new float[]{1.55f, 3.45f});
        planDetails.setWidthPercentage(100);
        planDetails.setSpacingBefore(8);
        planDetails.setSpacingAfter(10);
        addDecisionRow(planDetails, "Plano", quotation.getSelectedPlanName());
        addDecisionRow(planDetails, "Código do plano", quotation.getSelectedPlanCode());
        addDecisionRow(planDetails, "Cotação", quotation.getQuoteNumber());
        addDecisionRow(planDetails, "Modelo", quotation.getModel());
        addDecisionRow(planDetails, "Ano", quotation.getManufactureYear() == null ? "-" : quotation.getManufactureYear().toString());
        addDecisionRow(planDetails, "Valor FIPE", formatCurrency(quotation.getFipeValue()));
        addDecisionRow(planDetails, "Ressarcimento integral", quotation.getIndemnityFipePercent() + "% da FIPE");
        addDecisionRow(planDetails, "Mensalidade base", formatCurrency(quotation.getBaseMonthlyValue()));
        if (quotation.getMandatoryMonthlyFee() != null && quotation.getMandatoryMonthlyFee().signum() > 0) {
            addDecisionRow(planDetails, "Acréscimo obrigatório", formatCurrency(quotation.getMandatoryMonthlyFee()));
            addDecisionRow(planDetails, "Detalhe do acréscimo", safeValue(quotation.getMandatoryFeeDescription(), "Conforme condições do plano"));
        }
        if (quotation.getDiscountPercent() > 0) {
            addDecisionRow(planDetails, "Desconto", quotation.getDiscountPercent() + "%");
            addDecisionRow(planDetails, "Subtotal antes do desconto", formatCurrency(quotation.getPreDiscountMonthlyValue()));
        }
        addDecisionRow(planDetails, "Total mensal contratado", formatCurrency(quotation.getMonthlyValue()));
        if (quotation.getOneTimeFee() != null && quotation.getOneTimeFee().signum() > 0) {
            addDecisionRow(planDetails, "Taxa única", formatCurrency(quotation.getOneTimeFee()));
        }
        document.add(planDetails);

        if (!quotation.getSelectedOptionals().isEmpty()) {
            Paragraph optionalsTitle = subsectionTitle("ADICIONAIS CONTRATADOS");
            optionalsTitle.setSpacingBefore(6);
            document.add(optionalsTitle);

            PdfPTable optionals = new PdfPTable(new float[]{3.8f, 1.4f});
            optionals.setWidthPercentage(100);
            optionals.setSpacingAfter(10);
            for (QuotationOptionalCoverage optional : quotation.getSelectedOptionals()) {
                String description = optional.getCoverageName();
                if (optional.getDetail() != null && !optional.getDetail().isBlank()) {
                    description += " — " + optional.getDetail();
                }
                addDecisionRow(optionals, description, formatCurrency(optional.getMonthlyPrice()) + "/mês");
            }
            document.add(optionals);
        }

        Paragraph benefitsTitle = subsectionTitle("COBERTURAS E BENEFÍCIOS");
        benefitsTitle.setSpacingBefore(4);
        document.add(benefitsTitle);

        PdfPTable benefits = new PdfPTable(new float[]{1.15f, 2.45f, 3.1f});
        benefits.setWidthPercentage(100);
        benefits.setHeaderRows(1);
        benefits.setSpacingAfter(16);
        benefits.addCell(planHeaderCell("STATUS"));
        benefits.addCell(planHeaderCell("COBERTURA / BENEFÍCIO"));
        benefits.addCell(planHeaderCell("CONDIÇÕES / LIMITES"));

        Map<String, QuotationOptionalCoverage> selectedByCode = quotation.getSelectedOptionals().stream()
                .collect(Collectors.toMap(
                        QuotationOptionalCoverage::getCoverageCode,
                        Function.identity(),
                        (first, second) -> first
                ));

        int visible = 0;
        for (var item : quotation.getCoverageSnapshots()) {
            boolean included = item.getCoverageStatus() == CoverageStatus.INCLUDED;
            QuotationOptionalCoverage selectedOptional = selectedByCode.get(item.getCoverageCode());
            if (!included && selectedOptional == null) continue;

            benefits.addCell(planBodyCell(included ? "INCLUÍDO" : "CONTRATADO", true));
            benefits.addCell(planBodyCell(item.getCoverageName(), false));
            String detail = item.getDetail() == null || item.getDetail().isBlank()
                    ? "Conforme regulamento vigente"
                    : item.getDetail();
            benefits.addCell(planBodyCell(detail, false));
            visible++;
        }

        if (visible == 0 && !quotation.getSelectedOptionals().isEmpty()) {
            for (QuotationOptionalCoverage optional : quotation.getSelectedOptionals()) {
                benefits.addCell(planBodyCell("CONTRATADO", true));
                benefits.addCell(planBodyCell(optional.getCoverageName(), false));
                benefits.addCell(planBodyCell(safeValue(optional.getDetail(), "Conforme regulamento vigente"), false));
                visible++;
            }
        }

        if (visible == 0) {
            PdfPCell empty = new PdfPCell(new Phrase(
                    "Os benefícios deste plano seguem o regulamento vigente e não há coberturas detalhadas registradas na cotação.",
                    font(8, Font.NORMAL, MUTED)
            ));
            empty.setColspan(3);
            empty.setPadding(8);
            empty.setBorderColor(Color.WHITE);
            benefits.addCell(empty);
        }

        document.add(benefits);
    }

    private void addInspectionAssets(Document document, PdfWriter writer, InspectionRequest request) throws Exception {
        document.add(sectionTitle("ARQUIVOS DA VISTORIA"));

        List<AssetCard> imageCards = new ArrayList<>();
        List<AssetCard> fileCards = new ArrayList<>();
        List<AssetCard> pdfPreviewCards = new ArrayList<>();
        List<AssetCard> signatureCards = new ArrayList<>();

        List<InspectionAsset> assets = request.getAssets().stream()
                .filter(asset -> asset.getAssetType() != InspectionAssetType.REPORT)
                .sorted(Comparator.comparingInt(this::assetWeight).thenComparing(asset -> safeValue(asset.getLabel(), "")))
                .toList();

        for (InspectionAsset asset : assets) {
            if (!storageService.isAvailable(asset)) {
                fileCards.add(AssetCard.unavailable(asset.getLabel()));
                continue;
            }

            try {
                byte[] bytes = storageService.readAll(asset.getId());
                String fileName = asset.getFileName() == null || asset.getFileName().isBlank()
                        ? "arquivo-vistoria"
                        : asset.getFileName();
                String contentType = asset.getContentType() == null ? "" : asset.getContentType().toLowerCase(Locale.ROOT);

                PdfFileSpecification attachment = PdfFileSpecification.fileEmbedded(writer, null, fileName, bytes);
                writer.addFileAttachment(asset.getLabel(), attachment);

                if (contentType.startsWith("image/")) {
                    AssetCard imageCard = AssetCard.image(asset.getLabel(), fileName, bytes, asset.getAssetType(), humanSize(asset.getFileSize()));
                    if (asset.getAssetType() == InspectionAssetType.SIGNATURE) {
                        signatureCards.add(imageCard);
                    } else {
                        imageCards.add(imageCard);
                    }
                    continue;
                }

                if (isPdfDocument(contentType, fileName, bytes)) {
                    List<AssetCard> renderedPages = renderPdfPagesAsJpegCards(
                            bytes, asset.getLabel(), fileName, asset.getAssetType(), humanSize(asset.getFileSize())
                    );
                    if (!renderedPages.isEmpty()) {
                        pdfPreviewCards.addAll(renderedPages);
                        continue;
                    }
                }

                String typeLabel = asset.getAssetType() == InspectionAssetType.VIDEO || contentType.startsWith("video/")
                        ? "Vídeo anexado ao PDF"
                        : "Documento anexado ao PDF";
                fileCards.add(AssetCard.file(asset.getLabel(), fileName, typeLabel, humanSize(asset.getFileSize())));
            } catch (Exception exception) {
                fileCards.add(AssetCard.error(asset.getLabel()));
            }
        }

        if (imageCards.isEmpty() && fileCards.isEmpty() && pdfPreviewCards.isEmpty() && signatureCards.isEmpty()) {
            Paragraph empty = new Paragraph(
                    "Nenhum arquivo da vistoria foi encontrado para este relatório.",
                    font(9, Font.NORMAL, MUTED)
            );
            empty.setSpacingAfter(10);
            document.add(empty);
            return;
        }

        if (!imageCards.isEmpty()) {
            document.add(subsectionTitle("FOTOS E IMAGENS DA VISTORIA"));
            addAssetGrid(document, imageCards, false, PHOTO_GRID_COLUMNS);
        }


        if (!pdfPreviewCards.isEmpty()) {
            document.add(subsectionTitle("DOCUMENTOS PDF - PRÉVIA VISUAL DAS PÁGINAS"));
            Paragraph pdfNote = new Paragraph(
                    "Cada página dos documentos PDF foi convertida para uma prévia JPG e incorporada visualmente ao dossiê. O PDF original também permanece anexado.",
                    font(7.8f, Font.NORMAL, MUTED)
            );
            pdfNote.setSpacingAfter(7);
            document.add(pdfNote);
            addAssetGrid(document, pdfPreviewCards, false, DOCUMENT_GRID_COLUMNS);
        }

        if (!fileCards.isEmpty()) {
            document.add(subsectionTitle("DOCUMENTOS E OUTROS ANEXOS"));
            addAssetGrid(document, fileCards, true, DOCUMENT_GRID_COLUMNS);
        }

        if (!signatureCards.isEmpty()) {
            document.add(subsectionTitle("ASSINATURA DO ASSOCIADO"));
            addAssetGrid(document, signatureCards, false, DOCUMENT_GRID_COLUMNS);
        }
    }

    private void addAssetGrid(Document document, List<AssetCard> cards, boolean textOnly, int columns) throws Exception {
        int safeColumns = Math.max(1, Math.min(3, columns));
        PdfPTable grid = new PdfPTable(safeColumns);
        grid.setWidthPercentage(100);
        float[] widths = new float[safeColumns];
        java.util.Arrays.fill(widths, 1f);
        grid.setWidths(widths);
        grid.setSpacingAfter(14);

        int index = 0;
        for (AssetCard card : cards) {
            grid.addCell(buildAssetCell(card, textOnly));
            index++;
        }
        while (index % safeColumns != 0) {
            PdfPCell filler = new PdfPCell(new Phrase(""));
            filler.setBorder(Rectangle.NO_BORDER);
            filler.setFixedHeight(10);
            grid.addCell(filler);
            index++;
        }

        document.add(grid);
    }

    private PdfPCell buildAssetCell(AssetCard card, boolean textOnly) throws Exception {
        PdfPCell cell = new PdfPCell();
        cell.setPadding(8);
        cell.setBorderColor(LINE);
        cell.setBackgroundColor(Color.WHITE);
        cell.setVerticalAlignment(Element.ALIGN_TOP);

        Paragraph title = new Paragraph(safeValue(card.label(), "Arquivo"), font(8.5f, Font.BOLD, NAVY));
        title.setSpacingAfter(4);
        cell.addElement(title);

        if (card.previewBytes() != null && !textOnly) {
            Image image = Image.getInstance(card.previewBytes());
            float width = card.assetType() == InspectionAssetType.SIGNATURE ? 155f : 150f;
            float height = card.assetType() == InspectionAssetType.SIGNATURE ? 85f : 110f;
            image.scaleToFit(width, height);
            image.setAlignment(Image.ALIGN_CENTER);
            cell.addElement(image);
            Paragraph meta = new Paragraph(
                    safeValue(card.fileName(), "imagem") + (card.sizeLabel() == null ? "" : " • " + card.sizeLabel()),
                    font(7.3f, Font.NORMAL, MUTED)
            );
            meta.setSpacingBefore(5);
            cell.addElement(meta);
        } else {
            cell.addElement(new Paragraph(safeValue(card.fileName(), "arquivo-vistoria"), font(8, Font.BOLD, TEXT)));
            if (card.secondaryText() != null && !card.secondaryText().isBlank()) {
                Paragraph text = new Paragraph(card.secondaryText(), font(7.5f, Font.NORMAL, MUTED));
                text.setSpacingBefore(4);
                cell.addElement(text);
            }
            if (card.sizeLabel() != null && !card.sizeLabel().isBlank()) {
                Paragraph size = new Paragraph("Tamanho: " + card.sizeLabel(), font(7.2f, Font.NORMAL, MUTED));
                size.setSpacingBefore(3);
                cell.addElement(size);
            }
        }

        return cell;
    }

    private void addPermanentFooterNote(Document document) throws DocumentException {
        Paragraph footer = new Paragraph(
                "Relatório permanente do Retrato NH, sem prazo de validade. Os arquivos incorporados fazem parte deste dossiê digital.",
                font(8, Font.NORMAL, Color.GRAY)
        );
        footer.setSpacingBefore(2);
        footer.setSpacingAfter(4);
        footer.setAlignment(Element.ALIGN_CENTER);
        document.add(footer);
    }

    private void appendSupervisionDecision(
            Document document,
            InspectionRequest request,
            SiteDocumentService.StoredDocument regulation
    ) throws Exception {
        document.newPage();
        document.add(sectionTitle("DECISÃO DA SUPERVISÃO DE ANÁLISE"));

        Color decisionColor = request.getStatus() == InspectionRequestStatus.APPROVED ? APPROVED_GREEN : REJECTED_RED;
        PdfPTable decisionBadge = new PdfPTable(1);
        decisionBadge.setWidthPercentage(50);
        decisionBadge.setHorizontalAlignment(Element.ALIGN_CENTER);
        decisionBadge.setSpacingBefore(8);
        decisionBadge.setSpacingAfter(14);
        PdfPCell badge = new PdfPCell(new Phrase(decisionLabel(request), font(20, Font.BOLD, Color.WHITE)));
        badge.setBackgroundColor(decisionColor);
        badge.setBorder(Rectangle.NO_BORDER);
        badge.setHorizontalAlignment(Element.ALIGN_CENTER);
        badge.setPadding(11);
        decisionBadge.addCell(badge);
        document.add(decisionBadge);

        String statement = "A vistoria do associado " + safe(request.getAssociateName()) + " foi analisada e "
                + (request.getStatus() == InspectionRequestStatus.APPROVED ? "APROVADA" : "REJEITADA")
                + " pela Supervisão de Análise responsável, " + effectiveSupervisionResponsibleName(request) + ".";
        Paragraph decisionStatement = new Paragraph(statement, font(10.5f, Font.NORMAL, TEXT));
        decisionStatement.setAlignment(Element.ALIGN_JUSTIFIED);
        decisionStatement.setSpacingAfter(14);
        document.add(decisionStatement);

        PdfPTable details = new PdfPTable(new float[]{1.2f, 2.8f});
        details.setWidthPercentage(100);
        addDecisionRow(details, "Associado", request.getAssociateName());
        addDecisionRow(details, "Vistoria", request.getId().toString());
        addDecisionRow(details, "CPF", formatCpf(request.getCpf()));
        addDecisionRow(details, "Placa", request.getPlate() == null || request.getPlate().isBlank() ? "Veículo 0 km - sem placa" : request.getPlate());
        addDecisionRow(details, "Status", decisionLabel(request));
        addDecisionRow(details, "Supervisão responsável", effectiveSupervisionResponsibleName(request));
        addDecisionRow(details, "Decisão registrada por", safeReviewer(request));
        addDecisionRow(details, "Data e hora", request.getReviewedAt() == null ? "-" : request.getReviewedAt().format(SIGNATURE_DATE_TIME));
        addDecisionRow(details, "Observação", request.getAdminNote());
        document.add(details);
        document.add(Chunk.NEWLINE);

        addSignatureStyleBlock(document, request, regulation);
        if (request.getAcceptedAt() != null) {
            addAssociateWebAuthnAcceptance(document, request);
        }

        Paragraph legalNote = new Paragraph(
                "Registro eletrônico interno de análise e decisão. O PDF preserva os arquivos da vistoria como anexos e incorpora o regulamento vigente utilizado no dossiê.",
                font(8, Font.NORMAL, Color.GRAY)
        );
        legalNote.setAlignment(Element.ALIGN_CENTER);
        legalNote.setSpacingBefore(16);
        document.add(legalNote);
    }

    private boolean addRecoveredLegacyAssets(
            Document document,
            PdfWriter writer,
            List<LegacyAttachment> attachments
    ) throws Exception {
        if (attachments == null || attachments.isEmpty()) return false;

        List<AssetCard> photos = new ArrayList<>();
        List<AssetCard> documents = new ArrayList<>();
        List<AssetCard> pdfPreviewCards = new ArrayList<>();
        List<AssetCard> signatures = new ArrayList<>();

        for (LegacyAttachment attachment : attachments) {
            String label = safeValue(attachment.label(), "Arquivo recuperado");
            String lowerLabel = label.toLowerCase(Locale.ROOT);
            if (lowerLabel.contains("regulamento")) continue;

            String fileName = safeValue(attachment.fileName(), "arquivo-recuperado");
            byte[] bytes = attachment.bytes();
            if (bytes == null || bytes.length == 0) continue;

            PdfFileSpecification spec = PdfFileSpecification.fileEmbedded(writer, null, fileName, bytes);
            writer.addFileAttachment(label, spec);

            boolean signature = lowerLabel.contains("assinatura") || lowerLabel.contains("signature");
            boolean image = isImageBytes(bytes);
            if (image) {
                AssetCard card = AssetCard.image(
                        label,
                        fileName,
                        bytes,
                        signature ? InspectionAssetType.SIGNATURE : InspectionAssetType.PHOTO,
                        humanSize(bytes.length)
                );
                if (signature) signatures.add(card);
                else photos.add(card);
            } else if (isPdfDocument("application/pdf", fileName, bytes)) {
                List<AssetCard> renderedPages = renderPdfPagesAsJpegCards(
                        bytes, label, fileName, InspectionAssetType.OTHER_DOCUMENT, humanSize(bytes.length)
                );
                if (!renderedPages.isEmpty()) pdfPreviewCards.addAll(renderedPages);
                else documents.add(AssetCard.file(
                        label, fileName,
                        "Arquivo PDF recuperado do dossiê histórico e novamente incorporado ao PDF padronizado",
                        humanSize(bytes.length)
                ));
            } else {
                documents.add(AssetCard.file(
                        label,
                        fileName,
                        "Arquivo recuperado do dossiê histórico e novamente incorporado ao PDF padronizado",
                        humanSize(bytes.length)
                ));
            }
        }

        if (photos.isEmpty() && documents.isEmpty() && pdfPreviewCards.isEmpty() && signatures.isEmpty()) return false;

        document.add(sectionTitle("ARQUIVOS DA VISTORIA"));
        Paragraph recovered = new Paragraph(
                "Arquivos recuperados dos anexos internos do dossiê histórico e reorganizados no layout padronizado.",
                font(8.5f, Font.NORMAL, MUTED)
        );
        recovered.setSpacingAfter(9);
        document.add(recovered);

        if (!photos.isEmpty()) {
            document.add(subsectionTitle("FOTOS E IMAGENS DA VISTORIA"));
            addAssetGrid(document, photos, false, PHOTO_GRID_COLUMNS);
        }
        if (!pdfPreviewCards.isEmpty()) {
            document.add(subsectionTitle("DOCUMENTOS PDF RECUPERADOS - PRÉVIA VISUAL"));
            addAssetGrid(document, pdfPreviewCards, false, DOCUMENT_GRID_COLUMNS);
        }

        if (!documents.isEmpty()) {
            document.add(subsectionTitle("DOCUMENTOS E OUTROS ANEXOS"));
            addAssetGrid(document, documents, true, DOCUMENT_GRID_COLUMNS);
        }
        if (!signatures.isEmpty()) {
            document.add(subsectionTitle("ASSINATURA DO ASSOCIADO"));
            addAssetGrid(document, signatures, false, DOCUMENT_GRID_COLUMNS);
        }
        return true;
    }

    private boolean isImageBytes(byte[] bytes) {
        try {
            Image.getInstance(bytes);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void appendLegacyAnnex(Document document, PdfWriter writer, byte[] legacyReport) throws Exception {
        PdfFileSpecification legacyAttachment = PdfFileSpecification.fileEmbedded(
                writer, null, "dossie-historico-original.pdf", legacyReport
        );
        writer.addFileAttachment("Dossiê histórico original preservado", legacyAttachment);

        PdfReader legacyReader = new PdfReader(legacyReport);
        try {
            document.newPage();
            Paragraph title = new Paragraph("ANEXO HISTÓRICO DO DOSSIÊ ORIGINAL", font(15, Font.BOLD, NAVY));
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(7);
            document.add(title);
            Paragraph note = new Paragraph(
                    "Conteúdo original preservado para manter as evidências que já estavam consolidadas no relatório anterior.",
                    font(8.5f, Font.NORMAL, MUTED)
            );
            note.setAlignment(Element.ALIGN_CENTER);
            document.add(note);

            for (int pageNumber = 1; pageNumber <= legacyReader.getNumberOfPages(); pageNumber++) {
                document.newPage();
                document.add(new Paragraph(" ", font(1, Font.NORMAL, Color.WHITE)));
                Rectangle source = legacyReader.getPageSizeWithRotation(pageNumber);
                Rectangle target = PageSize.A4;
                float contentLeft = 28f;
                float contentRight = target.getWidth() - 28f;
                float contentBottom = PAGE_FOOTER_TOP + 8f;
                float contentTop = target.getHeight() - 24f;
                float contentWidth = contentRight - contentLeft;
                float contentHeight = contentTop - contentBottom;
                float scale = Math.min(contentWidth / source.getWidth(), contentHeight / source.getHeight());
                float x = contentLeft + (contentWidth - source.getWidth() * scale) / 2f;
                float y = contentBottom + (contentHeight - source.getHeight() * scale) / 2f;
                PdfImportedPage imported = writer.getImportedPage(legacyReader, pageNumber);
                writer.getDirectContent().addTemplate(imported, scale, 0, 0, scale, x, y);
            }
        } finally {
            legacyReader.close();
        }
    }

    private void appendRegulation(
            Document document,
            PdfWriter writer,
            SiteDocumentService.StoredDocument regulation
    ) throws Exception {
        PdfFileSpecification regulationAttachment = PdfFileSpecification.fileEmbedded(
                writer, null, regulation.fileName(), regulation.bytes()
        );
        writer.addFileAttachment("Regulamento do Associado NH", regulationAttachment);

        PdfReader regulationReader = new PdfReader(regulation.bytes());
        try {
            for (int pageNumber = 1; pageNumber <= regulationReader.getNumberOfPages(); pageNumber++) {
                document.newPage();
                document.add(new Paragraph(" ", font(1, Font.NORMAL, Color.WHITE)));

                Rectangle source = regulationReader.getPageSizeWithRotation(pageNumber);
                Rectangle target = PageSize.A4;
                float contentLeft = 28f;
                float contentRight = target.getWidth() - 28f;
                float contentBottom = PAGE_FOOTER_TOP + 8f;
                float contentTop = target.getHeight() - 24f;
                float contentWidth = contentRight - contentLeft;
                float contentHeight = contentTop - contentBottom;
                float scale = Math.min(contentWidth / source.getWidth(), contentHeight / source.getHeight());
                float x = contentLeft + (contentWidth - source.getWidth() * scale) / 2f;
                float y = contentBottom + (contentHeight - source.getHeight() * scale) / 2f;

                PdfImportedPage imported = writer.getImportedPage(regulationReader, pageNumber);
                PdfContentByte canvas = writer.getDirectContent();
                canvas.addTemplate(imported, scale, 0, 0, scale, x, y);
            }
        } finally {
            regulationReader.close();
        }
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
        associationCell.setBorderColor(LINE);
        associationCell.setPadding(12);
        associationCell.addElement(new Paragraph(ASSOCIATION_NAME, font(13.5f, Font.BOLD, Color.BLACK)));
        associationCell.addElement(new Paragraph("CNPJ: " + ASSOCIATION_CNPJ, font(10, Font.NORMAL, Color.BLACK)));
        associationCell.addElement(new Paragraph("Local: " + ASSOCIATION_LOCATION, font(9, Font.NORMAL, MUTED)));
        signature.addCell(associationCell);

        PdfPCell auditCell = new PdfPCell();
        auditCell.setBackgroundColor(LIGHT);
        auditCell.setBorderColor(LINE);
        auditCell.setPadding(12);
        auditCell.addElement(new Paragraph("REGISTRO DIGITAL DE ANÁLISE E DECISÃO", font(10, Font.BOLD, NAVY)));
        auditCell.addElement(signatureLine("Documento", "Relatório final da vistoria + Regulamento do Associado NH"));
        auditCell.addElement(signatureLine("Resultado", decisionLabel(request)));
        auditCell.addElement(signatureLine("Supervisão responsável", effectiveSupervisionResponsibleName(request)));
        auditCell.addElement(signatureLine("Registrado por", safeReviewer(request)));
        auditCell.addElement(signatureLine("Data", request.getReviewedAt() == null ? "-" : request.getReviewedAt().format(SIGNATURE_DATE_TIME)));
        auditCell.addElement(signatureLine("Razão", request.getAdminNote() == null || request.getAdminNote().isBlank()
                ? "Análise de vistoria realizada pela Supervisão responsável"
                : request.getAdminNote()));
        auditCell.addElement(signatureLine("Hash SHA-256 do registro", decisionHash(request, regulation)));
        signature.addCell(auditCell);

        document.add(signature);
    }

    private void addAssociateWebAuthnAcceptance(Document document, InspectionRequest request) throws DocumentException {
        Paragraph title = new Paragraph("ACEITE DIGITAL DO ASSOCIADO — WEBAUTHN", font(10.5f, Font.BOLD, NAVY));
        title.setSpacingBefore(14);
        title.setSpacingAfter(6);
        document.add(title);

        Paragraph description = new Paragraph(
                "O associado confirmou este aceite com verificação segura disponibilizada pelo próprio aparelho (biometria, PIN ou bloqueio equivalente). "
                        + "A prova criptográfica vincula explicitamente o CPF, o nome do associado, a selfie da vistoria e o hash do dossiê aprovado no momento do aceite.",
                font(8.3f, Font.NORMAL, TEXT)
        );
        description.setAlignment(Element.ALIGN_JUSTIFIED);
        description.setSpacingAfter(7);
        document.add(description);

        PdfPTable table = new PdfPTable(new float[]{1.25f, 2.75f});
        table.setWidthPercentage(100);
        addDecisionRow(table, "Associado", request.getAssociateName());
        addDecisionRow(table, "CPF vinculado", formatCpf(request.getCpf()));
        addDecisionRow(table, "Aceite confirmado em", request.getAcceptedAt().format(SIGNATURE_DATE_TIME));
        addDecisionRow(table, "Verificação do usuário", request.isAcceptanceUserVerified() ? "Confirmada pelo autenticador" : "Não confirmada");
        addDecisionRow(table, "Hash SHA-256 da selfie", request.getAcceptanceSelfieSha256());
        addDecisionRow(table, "Hash SHA-256 do dossiê aprovado", request.getAcceptanceDossierSha256());
        addDecisionRow(table, "Hash da evidência vinculada", request.getAcceptanceEvidenceHash());
        addDecisionRow(table, "Hash da prova WebAuthn", request.getAcceptanceProofHash());
        addDecisionRow(table, "IP registrado", request.getAcceptanceIp());
        String geolocation = request.getAcceptanceLatitude() == null || request.getAcceptanceLongitude() == null
                ? "Não autorizada/não disponível"
                : String.format(Locale.ROOT, "%.6f, %.6f (precisão aproximada: %s m)",
                request.getAcceptanceLatitude(), request.getAcceptanceLongitude(),
                request.getAcceptanceAccuracyMeters() == null ? "-" : String.format(Locale.ROOT, "%.0f", request.getAcceptanceAccuracyMeters()));
        addDecisionRow(table, "Geolocalização", geolocation);
        document.add(table);
    }

    private Paragraph signatureLine(String label, String value) {
        Paragraph paragraph = new Paragraph();
        paragraph.setSpacingBefore(3);
        paragraph.add(new Chunk(label + ": ", font(8, Font.BOLD, Color.BLACK)));
        paragraph.add(new Chunk(value == null || value.isBlank() ? "-" : value, font(8, Font.NORMAL, Color.BLACK)));
        return paragraph;
    }

    private PdfPCell planHeaderCell(String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font(8, Font.BOLD, Color.WHITE)));
        cell.setBackgroundColor(NAVY);
        cell.setBorderColor(NAVY);
        cell.setPadding(7);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        return cell;
    }

    private PdfPCell planBodyCell(String text, boolean centered) {
        PdfPCell cell = new PdfPCell(new Phrase(text == null || text.isBlank() ? "-" : text,
                font(8, Font.NORMAL, TEXT)));
        cell.setPadding(7);
        cell.setBorderColor(LINE);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        if (centered) cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        return cell;
    }

    private void addDecisionRow(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, font(9, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);

        PdfPCell valueCell = new PdfPCell(new Phrase(value == null || value.isBlank() ? "-" : value, font(9, Font.NORMAL, TEXT)));
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private Paragraph sectionTitle(String text) {
        Paragraph paragraph = new Paragraph();
        paragraph.add(new Chunk("| ", font(12.5f, Font.BOLD, YELLOW)));
        paragraph.add(new Chunk(text, font(12.5f, Font.BOLD, NAVY)));
        paragraph.setSpacingAfter(8);
        return paragraph;
    }

    private Paragraph subsectionTitle(String text) {
        Paragraph paragraph = new Paragraph(text, font(10, Font.BOLD, NAVY));
        paragraph.setSpacingAfter(6);
        return paragraph;
    }

    private void addLabelValue(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, font(8, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);

        PdfPCell valueCell = new PdfPCell(new Phrase(value == null || value.isBlank() ? "-" : value, font(9, Font.NORMAL, TEXT)));
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private void addWideLabelValue(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, font(8, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);

        PdfPCell valueCell = new PdfPCell(new Phrase(value == null || value.isBlank() ? "-" : value, font(9, Font.NORMAL, TEXT)));
        valueCell.setColspan(3);
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private void styleBannerCell(PdfPCell cell) {
        cell.setBackgroundColor(NAVY);
        cell.setBorderColor(NAVY);
        cell.setPadding(10);
    }

    private Font font(float size, int style, Color color) {
        return new Font(Font.HELVETICA, size, style, color);
    }

    private boolean isFinalDecision(InspectionRequest request) {
        return request.getStatus() == InspectionRequestStatus.APPROVED
                || request.getStatus() == InspectionRequestStatus.REJECTED;
    }

    private String decisionLabel(InspectionRequest request) {
        return request.getStatus() == InspectionRequestStatus.APPROVED ? "APROVADA" : "REJEITADA";
    }

    private String headerStatusLabel(InspectionRequest request) {
        if (request.getStatus() == null) return "EM ANDAMENTO";
        return switch (request.getStatus()) {
            case WAITING_FILES -> "AGUARDANDO ARQUIVOS";
            case UPLOADING_FILES -> "ENVIANDO ARQUIVOS";
            case CREATED -> "CRIADA";
            case UNDER_REVIEW -> "EM ANÁLISE";
            case COMPLETED -> request.getAnalysisStage() == null
                    ? "CONCLUÍDA"
                    : switch (request.getAnalysisStage()) {
                        case ANALYST_QUEUE -> "CONCLUÍDA";
                        case ANALYST_PENDING -> "ANÁLISE PENDENTE";
                        case SUPERVISION_QUEUE -> "EM SUPERVISÃO";
                        case FINISHED -> "CADASTRO FEITO";
                    };
            case APPROVED -> "APROVADA";
            case REJECTED -> "REJEITADA";
            case CANCELLED -> "CANCELADA";
            case EXPIRED -> "EXPIRADA";
        };
    }

    private String effectiveSupervisionResponsibleName(InspectionRequest request) {
        if (request != null
                && ("SUPERVISION_ANALYSIS".equals(request.getReviewedByRole())
                    || "ADMIN_SUPERVISION".equals(request.getReviewedByRole()))
                && request.getReviewedByName() != null
                && !request.getReviewedByName().isBlank()) {
            return request.getReviewedByName().trim();
        }
        return supervisionResponsibleName;
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
                + effectiveSupervisionResponsibleName(request) + "|"
                + safeReviewer(request) + "|"
                + safe(request.getAdminNote()) + "|"
                + regulation.fileName() + "|"
                + regulation.fileSize();
        digest.update(payload.getBytes(StandardCharsets.UTF_8));
        digest.update(regulation.bytes());
        String hash = HexFormat.of().withUpperCase().formatHex(digest.digest());
        return hash.replaceAll("(.{16})(?!$)", "$1 ");
    }

    private String shortInspectionId(InspectionRequest request) {
        String id = request.getId() == null ? "-" : request.getId().toString();
        return id.length() <= 12 ? id : id.substring(0, 12).toUpperCase(Locale.ROOT);
    }

    private int assetWeight(InspectionAsset asset) {
        return switch (asset.getAssetType()) {
            case PHOTO -> 1;
            case VEHICLE_DOCUMENT, IDENTITY_DOCUMENT, OTHER_DOCUMENT -> 2;
            case VIDEO -> 3;
            case SIGNATURE -> 4;
            default -> 5;
        };
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }


    private boolean isPdfDocument(String contentType, String fileName, byte[] bytes) {
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).contains("pdf")) return true;
        if (fileName != null && fileName.toLowerCase(Locale.ROOT).endsWith(".pdf")) return true;
        return bytes != null && bytes.length > 4
                && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F';
    }

    private List<AssetCard> renderPdfPagesAsJpegCards(
            byte[] pdfBytes, String label, String fileName, InspectionAssetType assetType, String sizeLabel
    ) {
        if (pdfBytes == null || pdfBytes.length == 0) return List.of();
        List<AssetCard> cards = new ArrayList<>();
        try (PDDocument pdf = Loader.loadPDF(pdfBytes)) {
            PDFRenderer renderer = new PDFRenderer(pdf);
            int totalPages = pdf.getNumberOfPages();
            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                BufferedImage rendered = renderer.renderImageWithDPI(pageIndex, 105, ImageType.RGB);
                try (ByteArrayOutputStream imageOutput = new ByteArrayOutputStream()) {
                    ImageIO.write(rendered, "jpg", imageOutput);
                    String pageLabel = safeValue(label, "Documento PDF") + " - página " + (pageIndex + 1) + "/" + totalPages;
                    String pageFileName = safeValue(fileName, "documento.pdf") + " - página " + (pageIndex + 1);
                    cards.add(AssetCard.image(pageLabel, pageFileName, imageOutput.toByteArray(), assetType, sizeLabel));
                } finally {
                    rendered.flush();
                }
            }
        } catch (Exception ignored) {
            return List.of();
        }
        return cards;
    }

    private byte[] stampRequiredSignaturesOnEveryPage(
            InspectionRequest request, byte[] generatedPdf, byte[] legacyReport
    ) {
        if (generatedPdf == null || generatedPdf.length == 0) return generatedPdf;
        PdfReader reader = null;
        PdfStamper stamper = null;
        try (ByteArrayOutputStream stampedOutput = new ByteArrayOutputStream()) {
            reader = new PdfReader(generatedPdf);
            stamper = new PdfStamper(reader, stampedOutput);
            ReportPageEvent pageStamp = new ReportPageEvent(request, legacyReport);

            Map<String, String> info = reader.getInfo();
            info.put("Keywords", REPORT_LAYOUT_VERSION);
            info.put("Subject", "Dossiê digital padronizado - assinaturas obrigatórias em todas as páginas");
            stamper.setInfoDictionary(info);

            for (int pageNumber = 1; pageNumber <= reader.getNumberOfPages(); pageNumber++) {
                PdfContentByte canvas = stamper.getOverContent(pageNumber);
                Rectangle pageSize = reader.getPageSizeWithRotation(pageNumber);
                pageStamp.stampPage(canvas, pageSize, pageNumber);
            }
            stamper.close();
            stamper = null;
            reader.close();
            reader = null;
            return stampedOutput.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível aplicar as assinaturas obrigatórias em todas as páginas do dossiê.", exception);
        } finally {
            try { if (stamper != null) stamper.close(); } catch (Exception ignored) {}
            try { if (reader != null) reader.close(); } catch (Exception ignored) {}
        }
    }

    private String humanSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format(Locale.ROOT, "%.1f KB", kb);
        return String.format(Locale.ROOT, "%.1f MB", kb / 1024.0);
    }

    private String formatCpf(String cpf) {
        if (cpf == null || cpf.isBlank()) return "-";
        String digits = cpf.replaceAll("\\D", "");
        if (digits.length() != 11) return cpf;
        return digits.substring(0, 3) + "." + digits.substring(3, 6) + "." + digits.substring(6, 9) + "-" + digits.substring(9);
    }

    private String formatCurrency(BigDecimal value) {
        if (value == null) return "R$ 0,00";
        return NumberFormat.getCurrencyInstance(new Locale("pt", "BR")).format(value);
    }

    private String safeValue(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private byte[] associateSignatureBytes(InspectionRequest request) {
        if (request == null || request.getAssets() == null) return null;
        return request.getAssets().stream()
                .filter(asset -> asset.getAssetType() == InspectionAssetType.SIGNATURE)
                .filter(storageService::isAvailable)
                .sorted(Comparator.comparingInt(InspectionAsset::getSortOrder))
                .findFirst()
                .map(asset -> {
                    try {
                        return storageService.readAll(asset.getId());
                    } catch (Exception ignored) {
                        return null;
                    }
                })
                .orElse(null);
    }

    private List<LegacyAttachment> extractEmbeddedAttachments(byte[] legacyReport) {
        if (legacyReport == null || legacyReport.length == 0) return List.of();
        PdfReader reader = null;
        try {
            reader = new PdfReader(legacyReport);
            PdfDictionary names = reader.getCatalog().getAsDict(PdfName.NAMES);
            if (names == null) return List.of();
            PdfDictionary embeddedFiles = names.getAsDict(PdfName.EMBEDDEDFILES);
            if (embeddedFiles == null) return List.of();
            Map<String, PdfObject> files = PdfNameTree.readTree(embeddedFiles);
            List<LegacyAttachment> result = new ArrayList<>();
            for (Map.Entry<String, PdfObject> entry : files.entrySet()) {
                PdfObject resolved = PdfReader.getPdfObject(entry.getValue());
                if (!(resolved instanceof PdfDictionary fileSpec)) continue;
                PdfDictionary ef = fileSpec.getAsDict(PdfName.EF);
                if (ef == null) continue;
                PdfObject streamObject = PdfReader.getPdfObject(ef.get(PdfName.F));
                if (!(streamObject instanceof PRStream)) {
                    streamObject = PdfReader.getPdfObject(ef.get(PdfName.UF));
                }
                if (!(streamObject instanceof PRStream)) continue;
                PRStream stream = (PRStream) streamObject;
                byte[] bytes = PdfReader.getStreamBytes(stream);
                if (bytes == null || bytes.length == 0) continue;

                PdfString uf = fileSpec.getAsString(PdfName.UF);
                PdfString f = fileSpec.getAsString(PdfName.F);
                String fileName = uf != null ? uf.toUnicodeString() : (f != null ? f.toUnicodeString() : entry.getKey());
                result.add(new LegacyAttachment(entry.getKey(), fileName, bytes));
            }
            return result;
        } catch (Exception ignored) {
            return List.of();
        } finally {
            if (reader != null) reader.close();
        }
    }

    private byte[] extractSignatureFromLegacyPdf(byte[] legacyReport) {
        for (LegacyAttachment attachment : extractEmbeddedAttachments(legacyReport)) {
            String key = safeValue(attachment.label(), "").toLowerCase(Locale.ROOT);
            if ((key.contains("assinatura") || key.contains("signature")) && isImageBytes(attachment.bytes())) {
                return attachment.bytes();
            }
        }
        return null;
    }

    private String footerSignatureCode(InspectionRequest request) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String payload = request.getId() + "|" + safe(request.getAssociateName()) + "|"
                    + safe(request.getCpf()) + "|" + request.getStatus() + "|"
                    + (request.getReviewedAt() == null ? "" : request.getReviewedAt().toString()) + "|"
                    + effectiveSupervisionResponsibleName(request);
            String hash = HexFormat.of().withUpperCase().formatHex(digest.digest(payload.getBytes(StandardCharsets.UTF_8)));
            return hash.substring(0, 12);
        } catch (Exception ignored) {
            return shortInspectionId(request);
        }
    }

    private record LegacyAttachment(String label, String fileName, byte[] bytes) {}

    private record AssetCard(
            String label,
            String fileName,
            String secondaryText,
            String sizeLabel,
            InspectionAssetType assetType,
            byte[] previewBytes
    ) {
        static AssetCard image(String label, String fileName, byte[] previewBytes, InspectionAssetType assetType, String sizeLabel) {
            return new AssetCard(label, fileName, null, sizeLabel, assetType, previewBytes);
        }

        static AssetCard file(String label, String fileName, String secondaryText, String sizeLabel) {
            return new AssetCard(label, fileName, secondaryText, sizeLabel, null, null);
        }

        static AssetCard unavailable(String label) {
            return new AssetCard(label, "arquivo indisponível", "O arquivo original não estava disponível no momento da geração do relatório.", null, null, null);
        }

        static AssetCard error(String label) {
            return new AssetCard(label, "falha ao incorporar", "Não foi possível incorporar este arquivo ao relatório.", null, null, null);
        }
    }

    private class ReportPageEvent extends PdfPageEventHelper {
        private final InspectionRequest request;
        private final byte[] associateSignature;

        private ReportPageEvent(InspectionRequest request, byte[] legacyReport) {
            this.request = request;
            byte[] currentSignature = associateSignatureBytes(request);
            this.associateSignature = currentSignature != null ? currentSignature : extractSignatureFromLegacyPdf(legacyReport);
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            stampPage(writer.getDirectContent(), document.getPageSize(), writer.getPageNumber());
        }

        private void stampPage(PdfContentByte canvas, Rectangle pageSize, int pageNumber) {
            float left = pageSize.getLeft() + 28f;
            float right = pageSize.getRight() - 28f;
            float bottom = pageSize.getBottom();
            float lineY = bottom + 80f;

            canvas.saveState();
            canvas.setColorStroke(YELLOW);
            canvas.setLineWidth(2.2f);
            canvas.moveTo(left, lineY);
            canvas.lineTo(right, lineY);
            canvas.stroke();
            canvas.restoreState();

            if (isFinalDecision(request)) {
                drawSupervisorDigitalSignature(canvas, left, bottom + 31f, 245f, 41f);
            } else {
                drawPendingSupervisorStamp(canvas, left, bottom + 31f, 245f, 41f);
            }
            drawAssociateSignature(canvas, right - 245f, bottom + 31f, 245f, 41f);

            Font footerFont = font(6.7f, Font.NORMAL, MUTED);
            Font pageFont = font(7f, Font.BOLD, NAVY);
            String footer = "NOVO HORIZONTE PROTEÇÃO VEICULAR • CNPJ " + ASSOCIATION_CNPJ + " • Vistoria " + shortInspectionId(request);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT, new Phrase(footer, footerFont), left, bottom + 17f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_RIGHT, new Phrase("Página " + pageNumber, pageFont), right, bottom + 17f, 0);
        }

        private void drawSupervisorDigitalSignature(PdfContentByte canvas, float x, float y, float w, float h) {
            drawMiniBox(canvas, x, y, w, h);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("ASSINADO DIGITALMENTE - SUPERVISÃO NH", font(5.7f, Font.BOLD, NAVY)), x + 6f, y + h - 9f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase(ASSOCIATION_NAME + " • CNPJ " + ASSOCIATION_CNPJ, font(5.1f, Font.BOLD, TEXT)), x + 6f, y + h - 17f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("Responsável: " + effectiveSupervisionResponsibleName(request) + " • " + decisionLabel(request), font(5.5f, Font.NORMAL, TEXT)), x + 6f, y + h - 25f, 0);
            String date = request.getReviewedAt() == null ? "data não registrada" : request.getReviewedAt().format(SIGNATURE_DATE_TIME);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("Data: " + date, font(5f, Font.NORMAL, MUTED)), x + 6f, y + h - 33f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("Registro/Hash: " + footerSignatureCode(request), font(4.9f, Font.NORMAL, MUTED)), x + 150f, y + 5f, 0);
        }

        private void drawPendingSupervisorStamp(PdfContentByte canvas, float x, float y, float w, float h) {
            drawMiniBox(canvas, x, y, w, h);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("SUPERVISÃO DE ANÁLISE", font(6.2f, Font.BOLD, NAVY)), x + 6f, y + h - 12f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("Aguardando decisão final da supervisão", font(5.8f, Font.NORMAL, MUTED)), x + 6f, y + h - 24f, 0);
        }

        private void drawAssociateSignature(PdfContentByte canvas, float x, float y, float w, float h) {
            drawMiniBox(canvas, x, y, w, h);
            float textX = x + 7f;
            if (associateSignature != null && associateSignature.length > 0) {
                try {
                    Image signatureImage = Image.getInstance(associateSignature);
                    signatureImage.scaleToFit(72f, 28f);
                    signatureImage.setAbsolutePosition(x + 7f, y + 6f);
                    canvas.addImage(signatureImage);
                    textX = x + 84f;
                } catch (Exception ignored) {
                    textX = x + 7f;
                }
            }
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("ASSINATURA DO ASSOCIADO", font(5.8f, Font.BOLD, NAVY)), textX, y + h - 10f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase(safeValue(request.getAssociateName(), "Associado"), font(6.8f, Font.BOLD, TEXT)), textX, y + h - 20f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase("CPF: " + formatCpf(request.getCpf()), font(5.7f, Font.NORMAL, MUTED)), textX, y + h - 29f, 0);
            if (associateSignature == null || associateSignature.length == 0) {
                ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                        new Phrase("Imagem da assinatura não disponível no armazenamento atual", font(5.1f, Font.NORMAL, MUTED)), textX, y + 5f, 0);
            }
        }

        private void drawMiniBox(PdfContentByte canvas, float x, float y, float w, float h) {
            canvas.saveState();
            canvas.setColorFill(new Color(250, 250, 252));
            canvas.setColorStroke(LINE);
            canvas.setLineWidth(.7f);
            canvas.roundRectangle(x, y, w, h, 4f);
            canvas.fillStroke();
            canvas.restoreState();
        }
    }

}
