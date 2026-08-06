package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;

@Service
public class RetratoPdfService {
    private static final Color NAVY = new Color(8, 15, 99);
    private static final Color YELLOW = new Color(255, 204, 0);
    private static final Color LIGHT = new Color(244, 246, 252);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm");

    private final InspectionAssetStorageService storageService;

    public RetratoPdfService(InspectionAssetStorageService storageService) {
        this.storageService = storageService;
    }

    public byte[] generate(InspectionRequest request) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 38, 38, 38, 42);
            PdfWriter.getInstance(document, output);
            document.open();

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

            PdfPTable data = new PdfPTable(new float[]{1, 2, 1, 2});
            data.setWidthPercentage(100);
            addPair(data, "Associado", request.getAssociateName());
            addPair(data, "Placa", request.getPlate() == null || request.getPlate().isBlank() ? "Veículo 0 km — sem placa" : request.getPlate());
            addPair(data, "CPF", maskCpf(request.getCpf()));
            addPair(data, "Consultor", request.getConsultantName());
            addPair(data, "Tipo", request.getRequestType().name().equals("NEW_INSPECTION") ? "Nova vistoria" : "Atualização de boleto");
            addPair(data, "Veículo", request.getVehicleType().displayName());
            addPair(data, "Criada em", request.getCreatedAt().format(DATE_TIME));
            if (request.getResidenceAddress() != null && !request.getResidenceAddress().isBlank()) {
                addFullWidthPair(data, "Endereço residencial", request.getResidenceAddress());
            }
            document.add(data);
            document.add(Chunk.NEWLINE);

            Paragraph subtitle = new Paragraph("Arquivos enviados", new Font(Font.HELVETICA, 13, Font.BOLD, NAVY));
            subtitle.setSpacingAfter(8);
            document.add(subtitle);

            for (InspectionAsset asset : request.getAssets()) {
                if (asset.getAssetType() == InspectionAssetType.REPORT) continue;

                String contentType = asset.getContentType() == null
                        ? ""
                        : asset.getContentType().toLowerCase(java.util.Locale.ROOT);
                if (asset.getAssetType() == InspectionAssetType.VIDEO || contentType.startsWith("video/")) {
                    Paragraph video = new Paragraph("Vídeo: " + asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY));
                    video.add(new Chunk("\nArquivo armazenado no banco de dados por 40 dias.",
                            new Font(Font.HELVETICA, 8, Font.NORMAL, Color.DARK_GRAY)));
                    video.setSpacingAfter(10);
                    document.add(video);
                    continue;
                }

                if (!contentType.startsWith("image/")) {
                    Paragraph documentFile = new Paragraph(asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY));
                    documentFile.add(new Chunk("\nDocumento armazenado no banco de dados por 40 dias.",
                            new Font(Font.HELVETICA, 8, Font.NORMAL, Color.DARK_GRAY)));
                    documentFile.setSpacingAfter(10);
                    document.add(documentFile);
                    continue;
                }

                try {
                    byte[] bytes = storageService.readAll(asset.getId());
                    Image image = Image.getInstance(bytes);
                    image.scaleToFit(500, 300);
                    image.setAlignment(Image.ALIGN_CENTER);
                    if (asset.getAssetType() == InspectionAssetType.SIGNATURE) {
                        document.add(new Paragraph("Assinatura eletrônica do associado", new Font(Font.HELVETICA, 12, Font.BOLD, NAVY)));
                    }
                    document.add(new Paragraph(asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY)));
                    document.add(image);
                    document.add(Chunk.NEWLINE);
                } catch (Exception ignored) {
                    document.add(new Paragraph(asset.getLabel() + " — prévia indisponível no relatório",
                            new Font(Font.HELVETICA, 9, Font.NORMAL, Color.DARK_GRAY)));
                }
            }

            Paragraph footer = new Paragraph(
                    "Documento gerado automaticamente pelo Retrato NH. Os arquivos originais ficam disponíveis no painel de análise por 40 dias.",
                    new Font(Font.HELVETICA, 8, Font.NORMAL, Color.GRAY)
            );
            footer.setSpacingBefore(12);
            footer.setAlignment(Element.ALIGN_CENTER);
            document.add(footer);
            document.close();
            return output.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o relatório da vistoria.", exception);
        }
    }

    private void addPair(PdfPTable table, String label, String value) {
        PdfPCell labelCell = new PdfPCell(new Phrase(label, new Font(Font.HELVETICA, 8, Font.BOLD, NAVY)));
        labelCell.setBackgroundColor(LIGHT);
        labelCell.setPadding(7);
        labelCell.setBorderColor(Color.WHITE);
        table.addCell(labelCell);
        PdfPCell valueCell = new PdfPCell(new Phrase(value == null ? "—" : value, new Font(Font.HELVETICA, 9)));
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
        PdfPCell valueCell = new PdfPCell(new Phrase(value == null ? "—" : value, new Font(Font.HELVETICA, 9)));
        valueCell.setColspan(3);
        valueCell.setPadding(7);
        valueCell.setBorderColor(Color.WHITE);
        table.addCell(valueCell);
    }

    private String maskCpf(String cpf) {
        if (cpf == null || cpf.length() != 11) return "***.***.***-**";
        return "***." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-**";
    }
}
