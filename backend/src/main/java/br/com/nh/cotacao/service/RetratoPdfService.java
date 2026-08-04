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

    private final GoogleDriveStorageService driveStorage;

    public RetratoPdfService(GoogleDriveStorageService driveStorage) {
        this.driveStorage = driveStorage;
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
            addPair(data, "Placa", request.getPlate());
            addPair(data, "CPF", maskCpf(request.getCpf()));
            addPair(data, "Consultor", request.getConsultantName());
            addPair(data, "Tipo", request.getRequestType().name().equals("NEW_INSPECTION") ? "Nova vistoria" : "Atualização de boleto");
            addPair(data, "Criada em", request.getCreatedAt().format(DATE_TIME));
            document.add(data);
            document.add(Chunk.NEWLINE);

            Paragraph subtitle = new Paragraph("Arquivos enviados", new Font(Font.HELVETICA, 13, Font.BOLD, NAVY));
            subtitle.setSpacingAfter(8);
            document.add(subtitle);

            for (InspectionAsset asset : request.getAssets()) {
                if (asset.getAssetType() == InspectionAssetType.VIDEO) {
                    Paragraph video = new Paragraph("Vídeo: " + asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY));
                    video.add(new Chunk("\n" + (asset.getDriveFileUrl() == null ? "Arquivo armazenado no Drive" : asset.getDriveFileUrl()),
                            new Font(Font.HELVETICA, 8, Font.NORMAL, Color.DARK_GRAY)));
                    video.setSpacingAfter(10);
                    document.add(video);
                    continue;
                }

                try {
                    byte[] bytes = driveStorage.download(asset.getDriveFileId());
                    Image image = Image.getInstance(bytes);
                    image.scaleToFit(500, 300);
                    image.setAlignment(Image.ALIGN_CENTER);
                    document.add(new Paragraph(asset.getLabel(), new Font(Font.HELVETICA, 10, Font.BOLD, NAVY)));
                    document.add(image);
                    document.add(Chunk.NEWLINE);
                } catch (Exception ignored) {
                    document.add(new Paragraph(asset.getLabel() + " — imagem armazenada no Drive",
                            new Font(Font.HELVETICA, 9, Font.NORMAL, Color.DARK_GRAY)));
                }
            }

            Paragraph footer = new Paragraph(
                    "Documento gerado automaticamente pelo Retrato NH. Os arquivos originais permanecem armazenados na pasta da vistoria no Google Drive.",
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

    private String maskCpf(String cpf) {
        if (cpf == null || cpf.length() != 11) return "***.***.***-**";
        return "***." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-**";
    }
}
