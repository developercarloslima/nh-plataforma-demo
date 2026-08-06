package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetStorageKind;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.repository.InspectionAssetRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class InspectionAssetStorageService {
    private final InspectionAssetRepository assetRepository;
    private final JdbcTemplate jdbcTemplate;
    private final int retentionDays;

    public InspectionAssetStorageService(
            InspectionAssetRepository assetRepository,
            JdbcTemplate jdbcTemplate,
            @Value("${app.inspection-storage.retention-days:40}") int retentionDays
    ) {
        this.assetRepository = assetRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.retentionDays = Math.max(1, retentionDays);
    }

    @Transactional
    public InspectionAsset store(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            long fileSize,
            int sortOrder,
            Path source
    ) {
        try {
            long actualSize = Files.size(source);
            if (actualSize != fileSize) {
                throw new IllegalArgumentException("O arquivo recebido está incompleto.");
            }
            OffsetDateTime storedAt = OffsetDateTime.now();
            InspectionAsset asset = InspectionAsset.createDatabase(
                    request,
                    type,
                    label,
                    fileName,
                    contentType,
                    fileSize,
                    sortOrder,
                    storedAt,
                    storedAt.plusDays(retentionDays)
            );
            request.addAsset(asset);
            assetRepository.saveAndFlush(asset);
            insertContent(asset.getId(), source, fileSize);
            return asset;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível armazenar o arquivo da vistoria no banco de dados.", exception);
        }
    }

    @Transactional
    public InspectionAsset storeBytes(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            int sortOrder,
            byte[] bytes
    ) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("O arquivo gerado está vazio.");
        }
        OffsetDateTime storedAt = OffsetDateTime.now();
        InspectionAsset asset = InspectionAsset.createDatabase(
                request,
                type,
                label,
                fileName,
                contentType,
                bytes.length,
                sortOrder,
                storedAt,
                storedAt.plusDays(retentionDays)
        );
        request.addAsset(asset);
        assetRepository.saveAndFlush(asset);
        insertContent(asset.getId(), new ByteArrayInputStream(bytes), bytes.length);
        return asset;
    }

    @Transactional(readOnly = true)
    public InspectionAsset requireAvailable(UUID inspectionId, UUID assetId) {
        InspectionAsset asset = assetRepository.findByIdAndInspectionRequest_Id(assetId, inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Arquivo da vistoria não encontrado."));
        if (!asset.isAvailable() || !contentExists(assetId)) {
            throw new IllegalArgumentException("Este arquivo não está mais disponível. O prazo de retenção é de 40 dias.");
        }
        return asset;
    }

    @Transactional(readOnly = true)
    public byte[] readAll(UUID assetId) {
        return jdbcTemplate.query(
                "select file_data from inspection_asset_contents where asset_id = ?",
                statement -> statement.setObject(1, assetId),
                resultSet -> {
                    if (!resultSet.next()) {
                        throw new IllegalArgumentException("Conteúdo do arquivo não encontrado.");
                    }
                    try (InputStream input = resultSet.getBinaryStream(1);
                         ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                        input.transferTo(output);
                        return output.toByteArray();
                    } catch (IOException exception) {
                        throw new IllegalStateException("Não foi possível ler o conteúdo do arquivo armazenado.", exception);
                    }
                }
        );
    }

    @Transactional(readOnly = true)
    public void writeTo(UUID assetId, OutputStream output) {
        jdbcTemplate.query(
                "select file_data from inspection_asset_contents where asset_id = ?",
                statement -> statement.setObject(1, assetId),
                resultSet -> {
                    if (!resultSet.next()) {
                        throw new IllegalArgumentException("Conteúdo do arquivo não encontrado.");
                    }
                    try (InputStream input = resultSet.getBinaryStream(1)) {
                        input.transferTo(output);
                    } catch (IOException exception) {
                        throw new IllegalStateException("Não foi possível transferir o conteúdo do arquivo.", exception);
                    }
                    return null;
                }
        );
    }


    @Transactional(readOnly = true)
    public void writeInspectionZip(UUID inspectionId, OutputStream output) {
        List<InspectionAsset> assets = assetRepository.findAllByInspectionRequest_IdOrderBySortOrderAsc(inspectionId)
                .stream()
                .filter(this::isAvailable)
                .toList();
        if (assets.isEmpty()) {
            throw new IllegalArgumentException("Esta vistoria não possui arquivos disponíveis para download.");
        }
        try (ZipOutputStream zip = new ZipOutputStream(output, java.nio.charset.StandardCharsets.UTF_8)) {
            java.util.Set<String> usedNames = new java.util.HashSet<>();
            for (InspectionAsset asset : assets) {
                String name = uniqueZipName(asset.getFileName(), usedNames);
                zip.putNextEntry(new ZipEntry(name));
                writeTo(asset.getId(), zip);
                zip.closeEntry();
            }
            zip.finish();
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o pacote de arquivos da vistoria.", exception);
        }
    }

    private String uniqueZipName(String requested, java.util.Set<String> usedNames) {
        String clean = requested == null || requested.isBlank() ? "arquivo" : requested.replaceAll("[\\/:*?\"<>|]", "-");
        if (usedNames.add(clean)) return clean;
        int dot = clean.lastIndexOf('.');
        String base = dot > 0 ? clean.substring(0, dot) : clean;
        String extension = dot > 0 ? clean.substring(dot) : "";
        int index = 2;
        while (!usedNames.add(base + "-" + index + extension)) index++;
        return base + "-" + index + extension;
    }

    @Transactional
    public int purgeExpired() {
        OffsetDateTime now = OffsetDateTime.now();
        int removed = jdbcTemplate.update("""
                delete from inspection_asset_contents content
                using inspection_assets asset
                where content.asset_id = asset.id
                  and asset.storage_kind = 'DATABASE'
                  and asset.purged_at is null
                  and asset.expires_at <= ?
                """, now);
        jdbcTemplate.update("""
                update inspection_assets
                   set purged_at = ?
                 where storage_kind = 'DATABASE'
                   and purged_at is null
                   and expires_at <= ?
                """, now, now);
        return removed;
    }

    public boolean isAvailable(InspectionAsset asset) {
        return asset != null && asset.getStorageKind() == InspectionAssetStorageKind.DATABASE && asset.isAvailable();
    }

    private void insertContent(UUID assetId, Path source, long size) {
        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (InputStream input = Files.newInputStream(source);
                 PreparedStatement statement = connection.prepareStatement(
                         "insert into inspection_asset_contents(asset_id, file_data) values (?, ?)")) {
                statement.setObject(1, assetId);
                statement.setBinaryStream(2, input, size);
                statement.executeUpdate();
            } catch (IOException exception) {
                throw new IllegalStateException("Não foi possível ler o arquivo temporário da vistoria.", exception);
            }
            return null;
        });
    }

    private void insertContent(UUID assetId, InputStream input, long size) {
        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (InputStream stream = input;
                 PreparedStatement statement = connection.prepareStatement(
                         "insert into inspection_asset_contents(asset_id, file_data) values (?, ?)")) {
                statement.setObject(1, assetId);
                statement.setBinaryStream(2, stream, size);
                statement.executeUpdate();
            } catch (IOException exception) {
                throw new IllegalStateException("Não foi possível armazenar o conteúdo do arquivo no banco de dados.", exception);
            }
            return null;
        });
    }

    @Transactional(readOnly = true)
    public boolean contentExists(UUID assetId) {
        Boolean exists = jdbcTemplate.queryForObject(
                "select exists(select 1 from inspection_asset_contents where asset_id = ?)",
                Boolean.class,
                assetId
        );
        return Boolean.TRUE.equals(exists);
    }
}
