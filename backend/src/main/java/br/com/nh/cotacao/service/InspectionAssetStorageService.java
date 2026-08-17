package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetStorageKind;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.repository.InspectionAssetRepository;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class InspectionAssetStorageService {
    private static final Logger log = LoggerFactory.getLogger(InspectionAssetStorageService.class);
    private static final int DIRECT_CHUNK_BYTES = 4 * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 10L * 1024 * 1024;

    private final InspectionAssetRepository assetRepository;
    private final JdbcTemplate jdbcTemplate;
    private final EntityManager entityManager;
    private final int retentionDays;

    public InspectionAssetStorageService(
            InspectionAssetRepository assetRepository,
            JdbcTemplate jdbcTemplate,
            EntityManager entityManager,
            @Value("${app.inspection-storage.retention-days:40}") int retentionDays
    ) {
        this.assetRepository = assetRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.entityManager = entityManager;
        this.retentionDays = Math.max(1, retentionDays);
    }

    /**
     * Compatibilidade com chamadas que já possuem um arquivo local temporário.
     * O conteúdo é imediatamente dividido e persistido no PostgreSQL.
     */
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
            try (InputStream input = Files.newInputStream(source)) {
                return storeStreamInternal(
                        request, type, label, fileName, contentType, fileSize, sortOrder, input
                );
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível armazenar o arquivo da vistoria no banco de dados.", exception);
        }
    }

    /**
     * Armazena um arquivo sem criar cópia persistente no filesystem do servidor.
     */
    @Transactional
    public InspectionAsset storeStream(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            long fileSize,
            int sortOrder,
            InputStream input
    ) {
        if (input == null) throw new IllegalArgumentException("O conteúdo do arquivo não foi informado.");
        try {
            return storeStreamInternal(
                    request, type, label, fileName, contentType, fileSize, sortOrder, input
            );
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
        try (InputStream input = new ByteArrayInputStream(bytes)) {
            return storeStreamInternal(
                    request, type, label, fileName, contentType, bytes.length, sortOrder, input
            );
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível armazenar o arquivo gerado.", exception);
        }
    }

    /**
     * Retorna as partes já confirmadas no PostgreSQL. Nenhuma parte é lida do disco.
     */
    @Transactional(readOnly = true)
    public ChunkUploadStatus chunkStatus(
            UUID inspectionId,
            InspectionAssetType assetType,
            int sortOrder,
            String uploadId,
            int totalChunks
    ) {
        List<BlobRow> rows = jdbcTemplate.query(
                """
                select id, upload_id, total_size, total_chunks, status, asset_id
                  from inspection_asset_blobs
                 where inspection_id = ?
                   and asset_type = ?
                   and sort_order = ?
                """,
                (resultSet, rowNum) -> new BlobRow(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getString("upload_id"),
                        resultSet.getLong("total_size"),
                        resultSet.getInt("total_chunks"),
                        resultSet.getString("status"),
                        resultSet.getObject("asset_id", UUID.class)
                ),
                inspectionId,
                assetType.name(),
                sortOrder
        );
        if (rows.isEmpty()) return new ChunkUploadStatus(false, List.of());

        BlobRow blob = rows.getFirst();
        if ("COMPLETE".equals(blob.status()) && blob.assetId() != null && contentExists(blob.assetId())) {
            return new ChunkUploadStatus(true, List.of());
        }
        if (!blob.uploadId().equals(uploadId) || blob.totalChunks() != totalChunks) {
            return new ChunkUploadStatus(false, List.of());
        }

        List<Integer> chunks = jdbcTemplate.query(
                """
                select chunk_index
                  from inspection_asset_blob_chunks
                 where blob_id = ?
                 order by chunk_index
                """,
                (resultSet, rowNum) -> resultSet.getInt(1),
                blob.id()
        );
        return new ChunkUploadStatus(false, List.copyOf(chunks));
    }

    /**
     * Grava uma parte imediatamente no PostgreSQL e, ao receber a última parte,
     * associa o conteúdo completo a um InspectionAsset na mesma transação.
     */
    @Transactional
    public ChunkStoreResult storeChunk(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            long totalSize,
            int sortOrder,
            String uploadId,
            int chunkIndex,
            int totalChunks,
            byte[] chunkBytes
    ) {
        if (request == null) throw new IllegalArgumentException("Vistoria não encontrada.");
        if (type == null) throw new IllegalArgumentException("Tipo do arquivo não informado.");
        if (totalSize <= 0) throw new IllegalArgumentException("O arquivo recebido está vazio.");
        validateStorageLimit(type, totalSize);
        if (totalChunks < 1 || totalChunks > 512) {
            throw new IllegalArgumentException("Quantidade de partes do arquivo inválida.");
        }
        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
            throw new IllegalArgumentException("Índice da parte do arquivo inválido.");
        }
        if (uploadId == null || uploadId.isBlank()) {
            throw new IllegalArgumentException("Identificador do envio não informado.");
        }
        if (chunkBytes == null || chunkBytes.length == 0) {
            throw new IllegalArgumentException("Uma das partes do arquivo está vazia.");
        }

        Optional<InspectionAsset> currentAsset = findSlotAsset(request, type, sortOrder);
        if (currentAsset.isPresent() && isAvailable(currentAsset.get())) {
            return new ChunkStoreResult(true, totalChunks, currentAsset.get());
        }

        // Se este slot foi rejeitado/excluído anteriormente, remova o metadado
        // indisponível antes de iniciar a nova sessão de upload. O orphanRemoval
        // elimina o registro antigo e os binários vinculados por cascade, evitando
        // colisões nas restrições únicas do slot durante o reenvio.
        removeUnavailableSlotAsset(request, type, sortOrder);

        BlobRow blob = lockOrCreateBlob(
                request.getId(), type, sortOrder, uploadId, label, fileName,
                contentType, totalSize, totalChunks
        );
        insertOrReplaceChunk(blob.id(), chunkIndex, chunkBytes);
        touchBlob(blob.id());

        BlobProgress progress = blobProgress(blob.id());
        if (!progress.complete(totalChunks, totalSize)) {
            request.markUploadStarted();
            return new ChunkStoreResult(false, progress.receivedChunks(), null);
        }

        InspectionAsset asset = createAssetMetadata(
                request, type, label, fileName, contentType, totalSize, sortOrder
        );
        int updated = jdbcTemplate.update(
                """
                update inspection_asset_blobs
                   set asset_id = ?, status = 'COMPLETE', completed_at = now(), updated_at = now()
                 where id = ? and status = 'UPLOADING'
                """,
                asset.getId(),
                blob.id()
        );
        if (updated != 1 || !contentExists(asset.getId())) {
            throw new IllegalStateException("O arquivo não pôde ser confirmado no PostgreSQL.");
        }
        log.info(
                "Retrato NH: arquivo confirmado no PostgreSQL inspectionId={} assetId={} type={} order={} bytes={} chunks={}",
                request.getId(), asset.getId(), type, sortOrder, totalSize, totalChunks
        );
        return new ChunkStoreResult(true, totalChunks, asset);
    }

    @Transactional(readOnly = true)
    public InspectionAsset requireAvailable(UUID inspectionId, UUID assetId) {
        InspectionAsset asset = assetRepository.findByIdAndInspectionRequest_Id(assetId, inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Arquivo da vistoria não encontrado."));
        if (!isAvailable(asset)) {
            throw new IllegalArgumentException("Este arquivo não está mais disponível. O prazo de retenção é de 40 dias.");
        }
        return asset;
    }

    @Transactional
    public void deleteAsset(UUID inspectionId, UUID assetId) {
        InspectionAsset asset = assetRepository.findByIdAndInspectionRequest_Id(assetId, inspectionId)
                .orElseThrow(() -> new IllegalArgumentException("Arquivo da vistoria não encontrado."));
        InspectionRequest request = asset.getInspectionRequest();
        String fileName = asset.getFileName();
        boolean userSubmittedAsset = asset.getAssetType() != InspectionAssetType.REPORT;

        List<InspectionAsset> currentAssets = assetRepository.findAllByInspectionRequest_IdOrderBySortOrderAsc(inspectionId);
        List<InspectionAsset> toDelete = currentAssets.stream()
                .filter(current -> current.getId().equals(assetId)
                        || (userSubmittedAsset && current.getAssetType() == InspectionAssetType.REPORT))
                .toList();

        OffsetDateTime purgedAt = OffsetDateTime.now();
        for (InspectionAsset current : toDelete) {
            // Remove primeiro o conteúdo/binário do slot. O metadado permanece
            // temporariamente como indisponível até o novo upload substituir o slot.
            // Isso evita deixar uma sessão COMPLETE antiga disputando a restrição
            // única (inspection_id, asset_type, sort_order) durante o reenvio.
            deleteBlobSlot(inspectionId, current.getAssetType(), current.getSortOrder());
            jdbcTemplate.update("delete from inspection_asset_contents where asset_id = ?", current.getId());
            current.markPurged(purgedAt);
        }

        if (userSubmittedAsset) {
            request.reopenForMissingFiles();
        }
        assetRepository.flush();
        entityManager.flush();
        log.info(
                "Retrato NH: arquivo excluído individualmente e vistoria reaberta inspectionId={} assetId={} fileName={} removedReport={}",
                inspectionId, assetId, fileName,
                toDelete.stream().anyMatch(current -> current.getAssetType() == InspectionAssetType.REPORT)
        );
    }

    @Transactional(readOnly = true)
    public byte[] readAll(UUID assetId) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            writeTo(assetId, output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível ler o conteúdo do arquivo armazenado.", exception);
        }
    }

    @Transactional(readOnly = true)
    public void writeTo(UUID assetId, OutputStream output) {
        if (output == null) throw new IllegalArgumentException("Destino do download não informado.");

        List<UUID> blobIds = jdbcTemplate.query(
                """
                select id
                  from inspection_asset_blobs
                 where asset_id = ? and status = 'COMPLETE'
                """,
                (resultSet, rowNum) -> resultSet.getObject(1, UUID.class),
                assetId
        );
        if (!blobIds.isEmpty()) {
            streamChunkedBlob(blobIds.getFirst(), output);
            return;
        }

        streamLegacyContent(assetId, output);
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
            Set<String> usedNames = new HashSet<>();
            for (InspectionAsset asset : assets) {
                String name = uniqueZipName(downloadFileName(asset), usedNames);
                zip.putNextEntry(new ZipEntry(name));
                writeForDownload(asset, zip);
                zip.closeEntry();
            }
            zip.finish();
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível gerar o pacote de arquivos da vistoria.", exception);
        }
    }

    @Transactional
    public int purgeExpired() {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime abandonedCutoff = now.minusDays(2);

        int abandoned = jdbcTemplate.update(
                "delete from inspection_asset_blobs where status = 'UPLOADING' and updated_at <= ?",
                abandonedCutoff
        );
        int chunked = jdbcTemplate.update(
                """
                delete from inspection_asset_blobs blob
                using inspection_assets asset
                where blob.asset_id = asset.id
                  and asset.storage_kind = 'DATABASE'
                  and asset.purged_at is null
                  and asset.expires_at <= ?
                """,
                now
        );
        int legacy = jdbcTemplate.update(
                """
                delete from inspection_asset_contents content
                using inspection_assets asset
                where content.asset_id = asset.id
                  and asset.storage_kind = 'DATABASE'
                  and asset.purged_at is null
                  and asset.expires_at <= ?
                """,
                now
        );
        jdbcTemplate.update(
                """
                update inspection_assets
                   set purged_at = ?
                 where storage_kind = 'DATABASE'
                   and purged_at is null
                   and expires_at <= ?
                """,
                now,
                now
        );
        return abandoned + chunked + legacy;
    }

    public boolean isAvailable(InspectionAsset asset) {
        // O limite de 10 MB vale somente para NOVOS uploads.
        // Vídeos legados maiores permanecem disponíveis até o fim da retenção e
        // são compactados apenas no momento do download, sem destruir o original.
        return asset != null
                && asset.getStorageKind() == InspectionAssetStorageKind.DATABASE
                && asset.isAvailable()
                && contentExists(asset.getId());
    }

    public boolean requiresVideoDownloadCompression(InspectionAsset asset) {
        return asset != null
                && asset.getAssetType() == InspectionAssetType.VIDEO
                && asset.getFileSize() > MAX_VIDEO_BYTES;
    }

    public String downloadFileName(InspectionAsset asset) {
        if (!requiresVideoDownloadCompression(asset)) return asset.getFileName();
        String name = asset.getFileName() == null || asset.getFileName().isBlank()
                ? "video-vistoria"
                : asset.getFileName().trim();
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        return base + "-compactado.mp4";
    }

    /**
     * Para vídeos legados acima de 10 MB, preserva o original no PostgreSQL e
     * entrega uma cópia H.264/AAC compactada somente durante o download.
     */
    @Transactional(readOnly = true)
    public void writeForDownload(InspectionAsset asset, OutputStream output) {
        if (asset == null) throw new IllegalArgumentException("Arquivo da vistoria não informado.");
        if (!requiresVideoDownloadCompression(asset)) {
            writeTo(asset.getId(), output);
            return;
        }
        writeCompressedVideo(asset, output);
    }

    private void writeCompressedVideo(InspectionAsset asset, OutputStream output) {
        Path source = null;
        Path compressed = null;
        try {
            source = Files.createTempFile("nh-video-original-", videoSourceExtension(asset.getContentType()));
            try (OutputStream fileOut = Files.newOutputStream(source)) {
                writeTo(asset.getId(), fileOut);
            }

            double durationSeconds = probeVideoDuration(source);
            if (!Double.isFinite(durationSeconds) || durationSeconds <= 0) {
                throw new IllegalStateException("Não foi possível identificar a duração do vídeo para compactação.");
            }

            compressed = Files.createTempFile("nh-video-download-", ".mp4");
            long[] targets = {
                    8_500_000L,
                    7_500_000L,
                    6_500_000L
            };
            boolean success = false;
            for (long targetBytes : targets) {
                Files.deleteIfExists(compressed);
                compressed = Files.createTempFile("nh-video-download-", ".mp4");
                transcodeVideo(source, compressed, durationSeconds, targetBytes);
                long size = Files.size(compressed);
                if (size > 0 && size <= MAX_VIDEO_BYTES) {
                    success = true;
                    break;
                }
            }
            if (!success) {
                throw new IllegalStateException("Não foi possível compactar o vídeo para até 10 MB.");
            }

            try (InputStream input = Files.newInputStream(compressed)) {
                input.transferTo(output);
            }
            log.info("Retrato NH: vídeo legado compactado somente para download assetId={} originalBytes={} downloadBytes={}",
                    asset.getId(), asset.getFileSize(), Files.size(compressed));
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível compactar o vídeo para download. O arquivo original permanece preservado.", exception);
        } finally {
            if (source != null) try { Files.deleteIfExists(source); } catch (Exception ignored) {}
            if (compressed != null) try { Files.deleteIfExists(compressed); } catch (Exception ignored) {}
        }
    }

    private double probeVideoDuration(Path source) throws Exception {
        Process process = new ProcessBuilder(
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                source.toAbsolutePath().toString()
        ).redirectErrorStream(true).start();
        String result;
        try (InputStream input = process.getInputStream()) {
            result = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).trim();
        }
        int exit = process.waitFor();
        if (exit != 0 || result.isBlank()) {
            throw new IllegalStateException("ffprobe não conseguiu ler a duração do vídeo.");
        }
        return Double.parseDouble(result.split("\\R")[0].trim());
    }

    private void transcodeVideo(Path source, Path destination, double durationSeconds, long targetBytes) throws Exception {
        // Reserva margem para container/metadata e áudio. O objetivo é ficar
        // confortavelmente abaixo de 10 MB em vez de encostar no limite.
        long targetTotalBps = Math.max(120_000L, (long) Math.floor((targetBytes * 8.0) / durationSeconds));
        long audioBps = Math.min(32_000L, Math.max(20_000L, targetTotalBps / 8));
        long videoBps = Math.max(80_000L, targetTotalBps - audioBps - 20_000L);

        Process process = new ProcessBuilder(
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", source.toAbsolutePath().toString(),
                "-vf", "scale=min(640\\,iw):-2",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-b:v", Long.toString(videoBps),
                "-maxrate", Long.toString(videoBps),
                "-bufsize", Long.toString(Math.max(160_000L, videoBps * 2)),
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", Long.toString(audioBps),
                "-ac", "1",
                "-ar", "32000",
                "-movflags", "+faststart",
                destination.toAbsolutePath().toString()
        ).redirectErrorStream(true).start();

        String errorText;
        try (InputStream input = process.getInputStream()) {
            errorText = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        int exit = process.waitFor();
        if (exit != 0 || !Files.exists(destination) || Files.size(destination) <= 0) {
            throw new IllegalStateException("ffmpeg falhou ao compactar o vídeo: " + errorText.trim());
        }
    }

    private String videoSourceExtension(String contentType) {
        String type = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
        return switch (type) {
            case "video/quicktime" -> ".mov";
            case "video/webm" -> ".webm";
            case "video/3gpp" -> ".3gp";
            default -> ".mp4";
        };
    }

    private void validateStorageLimit(InspectionAssetType type, long fileSize) {
        if (type == InspectionAssetType.VIDEO && fileSize > MAX_VIDEO_BYTES) {
            throw new IllegalArgumentException("O vídeo da vistoria deve possuir no máximo 10 MB.");
        }
    }

    @Transactional(readOnly = true)
    public boolean contentExists(UUID assetId) {
        Boolean exists = jdbcTemplate.queryForObject(
                """
                select (
                    exists (
                        select 1
                          from inspection_asset_blobs blob
                         where blob.asset_id = ?
                           and blob.status = 'COMPLETE'
                           and blob.total_chunks = (
                               select count(*) from inspection_asset_blob_chunks chunk where chunk.blob_id = blob.id
                           )
                           and blob.total_size = (
                               select coalesce(sum(chunk.chunk_size), 0) from inspection_asset_blob_chunks chunk where chunk.blob_id = blob.id
                           )
                    )
                    or exists (
                        select 1 from inspection_asset_contents legacy where legacy.asset_id = ?
                    )
                )
                """,
                Boolean.class,
                assetId,
                assetId
        );
        return Boolean.TRUE.equals(exists);
    }

    private InspectionAsset storeStreamInternal(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            long fileSize,
            int sortOrder,
            InputStream input
    ) throws IOException {
        if (fileSize <= 0) throw new IllegalArgumentException("O arquivo recebido está vazio.");
        validateStorageLimit(type, fileSize);
        Optional<InspectionAsset> existing = findSlotAsset(request, type, sortOrder);
        if (existing.isPresent() && isAvailable(existing.get())) {
            return existing.get();
        }
        removeUnavailableSlotAsset(request, type, sortOrder);
        // Um envio retomável abandonado pode ocupar o mesmo slot mesmo sem haver
        // InspectionAsset. A persistência direta deve substituir essa sessão antiga.
        deleteBlobSlot(request.getId(), type, sortOrder);

        int totalChunks = Math.toIntExact((fileSize + DIRECT_CHUNK_BYTES - 1L) / DIRECT_CHUNK_BYTES);
        UUID blobId = UUID.randomUUID();
        insertBlob(
                blobId, request.getId(), type, sortOrder,
                "direct-" + UUID.randomUUID(), label, fileName,
                normalizeContentType(contentType), fileSize, totalChunks
        );

        long remaining = fileSize;
        int chunkIndex = 0;
        while (remaining > 0) {
            int requested = (int) Math.min(DIRECT_CHUNK_BYTES, remaining);
            byte[] bytes = input.readNBytes(requested);
            if (bytes.length != requested) {
                throw new IllegalArgumentException("O arquivo recebido está incompleto.");
            }
            insertOrReplaceChunk(blobId, chunkIndex, bytes);
            remaining -= bytes.length;
            chunkIndex++;
        }
        if (input.read() != -1) {
            throw new IllegalArgumentException("O tamanho informado não corresponde ao arquivo recebido.");
        }

        BlobProgress progress = blobProgress(blobId);
        if (!progress.complete(totalChunks, fileSize)) {
            throw new IllegalStateException("O conteúdo do arquivo não foi integralmente persistido no PostgreSQL.");
        }

        InspectionAsset asset = createAssetMetadata(
                request, type, label, fileName, normalizeContentType(contentType), fileSize, sortOrder
        );
        int updated = jdbcTemplate.update(
                """
                update inspection_asset_blobs
                   set asset_id = ?, status = 'COMPLETE', completed_at = now(), updated_at = now()
                 where id = ? and status = 'UPLOADING'
                """,
                asset.getId(),
                blobId
        );
        if (updated != 1 || !contentExists(asset.getId())) {
            throw new IllegalStateException("O arquivo não pôde ser confirmado no PostgreSQL.");
        }
        log.info(
                "Retrato NH: arquivo direto confirmado no PostgreSQL inspectionId={} assetId={} type={} order={} bytes={} chunks={}",
                request.getId(), asset.getId(), type, sortOrder, fileSize, totalChunks
        );
        return asset;
    }

    private InspectionAsset createAssetMetadata(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            long fileSize,
            int sortOrder
    ) {
        OffsetDateTime storedAt = OffsetDateTime.now();
        InspectionAsset asset = InspectionAsset.createDatabase(
                request,
                type,
                cleanLabel(label),
                cleanFileName(fileName),
                normalizeContentType(contentType),
                fileSize,
                sortOrder,
                storedAt,
                storedAt.plusDays(retentionDays)
        );
        request.addAsset(asset);
        entityManager.persist(asset);
        entityManager.flush();
        return asset;
    }

    private BlobRow lockOrCreateBlob(
            UUID inspectionId,
            InspectionAssetType type,
            int sortOrder,
            String uploadId,
            String label,
            String fileName,
            String contentType,
            long totalSize,
            int totalChunks
    ) {
        List<BlobRow> rows = jdbcTemplate.query(
                """
                select id, upload_id, total_size, total_chunks, status, asset_id
                  from inspection_asset_blobs
                 where inspection_id = ?
                   and asset_type = ?
                   and sort_order = ?
                 for update
                """,
                (resultSet, rowNum) -> new BlobRow(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getString("upload_id"),
                        resultSet.getLong("total_size"),
                        resultSet.getInt("total_chunks"),
                        resultSet.getString("status"),
                        resultSet.getObject("asset_id", UUID.class)
                ),
                inspectionId,
                type.name(),
                sortOrder
        );

        if (!rows.isEmpty()) {
            BlobRow current = rows.getFirst();
            boolean sameUpload = current.uploadId().equals(uploadId)
                    && current.totalSize() == totalSize
                    && current.totalChunks() == totalChunks
                    && "UPLOADING".equals(current.status());
            if (sameUpload) return current;
            jdbcTemplate.update("delete from inspection_asset_blobs where id = ?", current.id());
        }

        UUID id = UUID.randomUUID();
        insertBlob(
                id, inspectionId, type, sortOrder, uploadId, label, fileName,
                normalizeContentType(contentType), totalSize, totalChunks
        );
        return new BlobRow(id, uploadId, totalSize, totalChunks, "UPLOADING", null);
    }

    private void deleteBlobSlot(UUID inspectionId, InspectionAssetType type, int sortOrder) {
        jdbcTemplate.update(
                "delete from inspection_asset_blobs where inspection_id = ? and asset_type = ? and sort_order = ?",
                inspectionId,
                type.name(),
                sortOrder
        );
    }

    private void insertBlob(
            UUID id,
            UUID inspectionId,
            InspectionAssetType type,
            int sortOrder,
            String uploadId,
            String label,
            String fileName,
            String contentType,
            long totalSize,
            int totalChunks
    ) {
        jdbcTemplate.update(
                """
                insert into inspection_asset_blobs(
                    id, inspection_id, asset_type, sort_order, upload_id,
                    label, file_name, content_type, total_size, total_chunks,
                    status, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADING', now(), now())
                """,
                id,
                inspectionId,
                type.name(),
                sortOrder,
                uploadId,
                cleanLabel(label),
                cleanFileName(fileName),
                contentType,
                totalSize,
                totalChunks
        );
    }

    private void insertOrReplaceChunk(UUID blobId, int chunkIndex, byte[] bytes) {
        jdbcTemplate.update(
                """
                insert into inspection_asset_blob_chunks(
                    blob_id, chunk_index, chunk_size, chunk_sha256, chunk_data, created_at
                ) values (?, ?, ?, ?, ?, now())
                on conflict (blob_id, chunk_index) do update
                    set chunk_size = excluded.chunk_size,
                        chunk_sha256 = excluded.chunk_sha256,
                        chunk_data = excluded.chunk_data,
                        created_at = now()
                """,
                blobId,
                chunkIndex,
                bytes.length,
                sha256(bytes),
                bytes
        );
    }

    private void touchBlob(UUID blobId) {
        jdbcTemplate.update("update inspection_asset_blobs set updated_at = now() where id = ?", blobId);
    }

    private BlobProgress blobProgress(UUID blobId) {
        return jdbcTemplate.queryForObject(
                """
                select count(*)::int as received_chunks,
                       coalesce(sum(chunk_size), 0)::bigint as received_bytes,
                       coalesce(min(chunk_index), -1)::int as min_index,
                       coalesce(max(chunk_index), -1)::int as max_index
                  from inspection_asset_blob_chunks
                 where blob_id = ?
                """,
                (resultSet, rowNum) -> new BlobProgress(
                        resultSet.getInt("received_chunks"),
                        resultSet.getLong("received_bytes"),
                        resultSet.getInt("min_index"),
                        resultSet.getInt("max_index")
                ),
                blobId
        );
    }

    private Optional<InspectionAsset> findSlotAsset(
            InspectionRequest request,
            InspectionAssetType type,
            int sortOrder
    ) {
        if (request == null || request.getAssets() == null) return Optional.empty();
        return request.getAssets().stream()
                .filter(asset -> asset.getAssetType() == type && asset.getSortOrder() == sortOrder)
                .findFirst();
    }

    private void removeUnavailableSlotAsset(
            InspectionRequest request,
            InspectionAssetType type,
            int sortOrder
    ) {
        List<InspectionAsset> stale = new ArrayList<>(request.getAssets().stream()
                .filter(asset -> asset.getAssetType() == type && asset.getSortOrder() == sortOrder)
                .filter(asset -> !isAvailable(asset))
                .toList());
        if (stale.isEmpty()) return;
        for (InspectionAsset asset : stale) {
            request.removeAsset(asset);
        }
        entityManager.flush();
    }

    private void streamChunkedBlob(UUID blobId, OutputStream output) {
        final int[] count = {0};
        jdbcTemplate.query(
                """
                select chunk_data
                  from inspection_asset_blob_chunks
                 where blob_id = ?
                 order by chunk_index
                """,
                statement -> statement.setObject(1, blobId),
                resultSet -> {
                    while (resultSet.next()) {
                        count[0]++;
                        try (InputStream input = resultSet.getBinaryStream(1)) {
                            input.transferTo(output);
                        } catch (IOException exception) {
                            throw new IllegalStateException("Não foi possível transferir o conteúdo do arquivo.", exception);
                        }
                    }
                    return null;
                }
        );
        if (count[0] == 0) throw new IllegalArgumentException("Conteúdo do arquivo não encontrado.");
    }

    private void streamLegacyContent(UUID assetId, OutputStream output) {
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

    private String uniqueZipName(String requested, Set<String> usedNames) {
        String clean = requested == null || requested.isBlank()
                ? "arquivo"
                : requested.replaceAll("[\\/:*?\"<>|]", "-");
        if (usedNames.add(clean)) return clean;
        int dot = clean.lastIndexOf('.');
        String base = dot > 0 ? clean.substring(0, dot) : clean;
        String extension = dot > 0 ? clean.substring(dot) : "";
        int index = 2;
        while (!usedNames.add(base + "-" + index + extension)) index++;
        return base + "-" + index + extension;
    }

    private String cleanLabel(String value) {
        String clean = value == null ? "Arquivo" : value.trim().replaceAll("\\s+", " ");
        if (clean.isBlank()) clean = "Arquivo";
        return clean.length() > 140 ? clean.substring(0, 140) : clean;
    }

    private String cleanFileName(String value) {
        String clean = value == null ? "arquivo.bin" : value.trim().replaceAll("[\\/:*?\"<>|]", "-");
        if (clean.isBlank()) clean = "arquivo.bin";
        return clean.length() > 220 ? clean.substring(0, 220) : clean;
    }

    private String normalizeContentType(String value) {
        String clean = value == null ? "application/octet-stream" : value.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        return clean.isBlank() ? "application/octet-stream" : clean;
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível validar a parte do arquivo.", exception);
        }
    }

    public record ChunkUploadStatus(boolean complete, List<Integer> receivedChunks) {}

    public record ChunkStoreResult(boolean complete, int receivedChunks, InspectionAsset asset) {}

    private record BlobRow(
            UUID id,
            String uploadId,
            long totalSize,
            int totalChunks,
            String status,
            UUID assetId
    ) {}

    private record BlobProgress(
            int receivedChunks,
            long receivedBytes,
            int minIndex,
            int maxIndex
    ) {
        boolean complete(int expectedChunks, long expectedBytes) {
            return receivedChunks == expectedChunks
                    && receivedBytes == expectedBytes
                    && minIndex == 0
                    && maxIndex == expectedChunks - 1;
        }
    }
}
