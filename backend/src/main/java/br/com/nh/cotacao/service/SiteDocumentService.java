package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.CatalogChangeAudit;
import br.com.nh.cotacao.repository.CatalogChangeAuditRepository;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class SiteDocumentService {
    public static final String REGULATION_KEY = "VEHICLE_PROTECTION_REGULATION";
    public static final String DEFAULT_REGULATION_FILE = "Regulamento-PPV-Novo-Horizonte-2026.pdf";
    private static final String DEFAULT_REGULATION_RESOURCE = "default-documents/regulamento-ppv-novo-horizonte-2026.pdf";
    private static final long MAX_REGULATION_BYTES = 20L * 1024L * 1024L;

    private final JdbcTemplate jdbcTemplate;
    private final CatalogChangeAuditRepository auditRepository;

    public SiteDocumentService(JdbcTemplate jdbcTemplate, CatalogChangeAuditRepository auditRepository) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditRepository = auditRepository;
    }

    @Transactional(readOnly = true)
    public DocumentMetadata regulationMetadata() {
        List<DocumentMetadata> rows = jdbcTemplate.query(
                """
                select file_name, content_type, file_size, updated_by, updated_at
                  from site_documents
                 where document_key = ?
                """,
                (rs, rowNum) -> new DocumentMetadata(
                        rs.getString("file_name"),
                        rs.getString("content_type"),
                        rs.getLong("file_size"),
                        rs.getString("updated_by"),
                        rs.getObject("updated_at", OffsetDateTime.class),
                        true
                ),
                REGULATION_KEY
        );
        if (!rows.isEmpty()) return rows.getFirst();

        try {
            ClassPathResource resource = new ClassPathResource(DEFAULT_REGULATION_RESOURCE);
            return new DocumentMetadata(
                    DEFAULT_REGULATION_FILE,
                    "application/pdf",
                    resource.contentLength(),
                    "SYSTEM",
                    null,
                    false
            );
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível carregar o regulamento padrão.", exception);
        }
    }

    @Transactional(readOnly = true)
    public StoredDocument regulationFile() {
        List<StoredDocument> rows = jdbcTemplate.query(
                """
                select file_name, content_type, file_size, file_data
                  from site_documents
                 where document_key = ?
                """,
                (rs, rowNum) -> new StoredDocument(
                        rs.getString("file_name"),
                        rs.getString("content_type"),
                        rs.getLong("file_size"),
                        rs.getBytes("file_data")
                ),
                REGULATION_KEY
        );
        if (!rows.isEmpty()) return rows.getFirst();

        try {
            ClassPathResource resource = new ClassPathResource(DEFAULT_REGULATION_RESOURCE);
            byte[] bytes;
            try (var input = resource.getInputStream()) {
                bytes = input.readAllBytes();
            }
            return new StoredDocument(DEFAULT_REGULATION_FILE, "application/pdf", bytes.length, bytes);
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível carregar o regulamento padrão.", exception);
        }
    }

    @Transactional
    public DocumentMetadata updateRegulation(MultipartFile file, String username) {
        validatePdf(file);
        String fileName = safeFileName(file.getOriginalFilename());
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível ler o PDF enviado.", exception);
        }

        DocumentMetadata old = regulationMetadata();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                """
                insert into site_documents(document_key, file_name, content_type, file_size, file_data, updated_by, updated_at)
                values (?, ?, 'application/pdf', ?, ?, ?, ?)
                on conflict (document_key) do update set
                    file_name = excluded.file_name,
                    content_type = excluded.content_type,
                    file_size = excluded.file_size,
                    file_data = excluded.file_data,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
                """,
                REGULATION_KEY,
                fileName,
                bytes.length,
                bytes,
                username,
                now
        );

        auditRepository.save(CatalogChangeAudit.createText(
                "SITE_DOCUMENT",
                null,
                REGULATION_KEY,
                "Regulamento do site substituído",
                describe(old),
                "arquivo=" + fileName + "; tamanho=" + bytes.length + " bytes",
                username
        ));
        return regulationMetadata();
    }

    private void validatePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Selecione um arquivo PDF para o regulamento.");
        }
        if (file.getSize() > MAX_REGULATION_BYTES) {
            throw new IllegalArgumentException("O regulamento deve ter no máximo 20 MB.");
        }
        String fileName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().trim();
        if (!fileName.toLowerCase().endsWith(".pdf")) {
            throw new IllegalArgumentException("O regulamento precisa ser enviado em formato PDF.");
        }
        try (var input = file.getInputStream()) {
            byte[] prefix = input.readNBytes(5);
            if (prefix.length < 5 || prefix[0] != '%' || prefix[1] != 'P' || prefix[2] != 'D' || prefix[3] != 'F' || prefix[4] != '-') {
                throw new IllegalArgumentException("O arquivo enviado não é um PDF válido.");
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível validar o PDF enviado.", exception);
        }
    }

    private String safeFileName(String value) {
        String fileName = value == null || value.isBlank() ? DEFAULT_REGULATION_FILE : value.trim();
        fileName = fileName.replace('\\', '/');
        if (fileName.contains("/")) fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
        fileName = fileName.replaceAll("[\\r\\n\\t]", " ").trim();
        if (fileName.length() > 255) {
            int extensionLength = fileName.toLowerCase().endsWith(".pdf") ? 4 : 0;
            String extension = extensionLength == 4 ? ".pdf" : "";
            fileName = fileName.substring(0, 255 - extension.length()) + extension;
        }
        return fileName;
    }

    private String describe(DocumentMetadata metadata) {
        if (metadata == null) return "não configurado";
        return "arquivo=" + metadata.fileName() + "; tamanho=" + metadata.fileSize() + " bytes; origem=" + (metadata.customized() ? "admin" : "padrão");
    }

    public record DocumentMetadata(
            String fileName,
            String contentType,
            long fileSize,
            String updatedBy,
            OffsetDateTime updatedAt,
            boolean customized
    ) {}

    public record StoredDocument(String fileName, String contentType, long fileSize, byte[] bytes) {}
}
