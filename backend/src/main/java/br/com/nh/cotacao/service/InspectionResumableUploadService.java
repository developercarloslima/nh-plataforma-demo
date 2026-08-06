package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.InspectionDtos.ChunkUploadResponse;
import br.com.nh.cotacao.dto.InspectionDtos.ChunkUploadStatusResponse;
import br.com.nh.cotacao.dto.InspectionDtos.InspectionResponse;
import br.com.nh.cotacao.dto.InspectionDtos.InspectionUploadResponse;
import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.entity.InspectionRequest;
import br.com.nh.cotacao.entity.InspectionRequestStatus;
import br.com.nh.cotacao.entity.InspectionRequestType;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

@Service
public class InspectionResumableUploadService {
    private static final long MAX_PHOTO_BYTES = 12L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 220L * 1024 * 1024;
    private static final long MAX_SIGNATURE_BYTES = 3L * 1024 * 1024;
    private static final long MAX_DOCUMENT_BYTES = 18L * 1024 * 1024;
    private static final long MAX_CHUNK_BYTES = 6L * 1024 * 1024;
    private static final int MAX_CHUNKS = 512;
    private static final Set<String> PHOTO_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final Set<String> VIDEO_TYPES = Set.of("video/mp4", "video/quicktime", "video/webm", "video/3gpp");
    private static final Set<String> DOCUMENT_TYPES = Set.of("application/pdf", "image/jpeg", "image/png", "image/webp");
    private static final Duration STALE_UPLOAD_AGE = Duration.ofDays(2);
    private static final Duration CLEANUP_INTERVAL = Duration.ofHours(1);

    private final InspectionRequestRepository repository;
    private final InspectionAssetStorageService storageService;
    private final RetratoPdfService pdfService;
    private final RetratoService retratoService;
    private final EntityManager entityManager;
    private final Path uploadRoot;
    private final Map<String, Object> uploadLocks = new ConcurrentHashMap<>();
    private final AtomicLong lastCleanupAt = new AtomicLong(0);

    public InspectionResumableUploadService(
            InspectionRequestRepository repository,
            InspectionAssetStorageService storageService,
            RetratoPdfService pdfService,
            RetratoService retratoService,
            EntityManager entityManager,
            @Value("${app.inspection-upload.temp-dir:/tmp/nh-inspection-uploads}") String uploadTempDir
    ) {
        this.repository = repository;
        this.storageService = storageService;
        this.pdfService = pdfService;
        this.retratoService = retratoService;
        this.entityManager = entityManager;
        this.uploadRoot = Path.of(uploadTempDir).toAbsolutePath().normalize();
    }

    @Transactional(readOnly = true)
    public ChunkUploadStatusResponse chunkStatus(
            String token,
            InspectionAssetType assetType,
            int sortOrder,
            String uploadId,
            int totalChunks
    ) {
        InspectionRequest request = findByToken(token);
        Optional<InspectionAsset> storedAsset = findAsset(request, assetType, sortOrder);
        if (storedAsset.isPresent() && storageService.contentExists(storedAsset.get().getId())) {
            return new ChunkUploadStatusResponse(true, List.of(), retratoService.toResponse(request));
        }
        validateRequestAvailable(request);
        if (totalChunks < 1 || totalChunks > MAX_CHUNKS) {
            throw new IllegalArgumentException("Quantidade de partes do arquivo inválida.");
        }
        Path directory = uploadDirectory(token, sanitizeUploadId(uploadId));
        List<Integer> received = new ArrayList<>();
        for (int index = 0; index < totalChunks; index++) {
            if (Files.isRegularFile(directory.resolve(String.format(Locale.ROOT, "%06d.part", index)))) {
                received.add(index);
            }
        }
        return new ChunkUploadStatusResponse(false, List.copyOf(received), retratoService.toResponse(request));
    }

    @Transactional
    public ChunkUploadResponse uploadChunk(
            String token,
            InspectionAssetType assetType,
            int sortOrder,
            String label,
            String uploadId,
            int chunkIndex,
            int totalChunks,
            long totalSize,
            String contentType,
            MultipartFile chunk
    ) {
        cleanupStaleUploadsIfNeeded();
        InspectionRequest request = findByToken(token);
        Optional<InspectionAsset> existing = findAsset(request, assetType, sortOrder);
        if (existing.isPresent() && storageService.contentExists(existing.get().getId())) {
            return completedChunkResponse(request, assetType, sortOrder, totalChunks);
        }
        validateRequestAvailable(request);
        String cleanType = cleanType(contentType);
        String cleanLabel = validateAssetMetadata(request, assetType, sortOrder, label, totalSize, cleanType);
        validateChunk(uploadId, chunkIndex, totalChunks, chunk);

        String safeUploadId = sanitizeUploadId(uploadId);
        Path uploadDirectory = uploadDirectory(token, safeUploadId);
        persistChunk(uploadDirectory, chunkIndex, chunk);
        int receivedChunks = countReceivedChunks(uploadDirectory, totalChunks);

        if (receivedChunks < totalChunks) {
            return new ChunkUploadResponse(
                    false,
                    receivedChunks,
                    totalChunks,
                    assetType,
                    sortOrder,
                    retratoService.toResponse(request)
            );
        }

        String lockKey = request.getId() + ":" + assetType + ":" + sortOrder;
        Object lock = uploadLocks.computeIfAbsent(lockKey, ignored -> new Object());
        try {
            synchronized (lock) {
                InspectionRequest current = findByToken(token);
                validateRequestAvailable(current);
                Optional<InspectionAsset> currentAsset = findAsset(current, assetType, sortOrder);
                if (currentAsset.isPresent() && storageService.contentExists(currentAsset.get().getId())) {
                    deleteDirectoryQuietly(uploadDirectory);
                    return completedChunkResponse(current, assetType, sortOrder, totalChunks);
                }

                Path assembledFile = assemble(uploadDirectory, totalChunks, totalSize);
                String fileName = buildFileName(assetType, sortOrder, cleanLabel, cleanType);
                InspectionAsset stored = storageService.store(
                        current,
                        assetType,
                        cleanLabel,
                        fileName,
                        cleanType,
                        totalSize,
                        sortOrder,
                        assembledFile
                );
                repository.saveAndFlush(current);
                entityManager.flush();

                if (!storageService.contentExists(stored.getId())) {
                    throw new IllegalStateException("O arquivo chegou ao servidor, mas o conteúdo não foi confirmado no banco de dados.");
                }

                entityManager.clear();
                InspectionRequest confirmed = findByToken(token);
                Optional<InspectionAsset> confirmedAsset = findAsset(confirmed, assetType, sortOrder);
                if (confirmedAsset.isEmpty() || !storageService.contentExists(confirmedAsset.get().getId())) {
                    throw new IllegalStateException("O arquivo não pôde ser confirmado no banco de dados.");
                }

                deleteDirectoryQuietly(uploadDirectory);
                return completedChunkResponse(confirmed, assetType, sortOrder, totalChunks);
            }
        } finally {
            uploadLocks.remove(lockKey, lock);
        }
    }

    @Transactional
    public InspectionUploadResponse finalizeUpload(String token, String residenceAddress) {
        InspectionRequest request = repository.findByPublicTokenForUpdate(token)
                .orElseThrow(() -> new IllegalArgumentException("Link de vistoria inválido."));
        if (isCompleted(request)) {
            return completedUploadResponse(request);
        }
        validateRequestAvailable(request);

        boolean newInspection = request.getRequestType() == InspectionRequestType.NEW_INSPECTION;
        int requiredPhotos = request.getVehicleType().requiredPhotoCount();
        if (newInspection) {
            request.registerResidenceAddress(residenceAddress);
            for (int order = 1; order <= requiredPhotos; order++) {
                if (findAsset(request, InspectionAssetType.PHOTO, order).isEmpty()) {
                    throw new IllegalArgumentException("Ainda falta enviar a foto " + order + " de " + requiredPhotos + ".");
                }
            }
            int signatureOrder = requiredPhotos + 2;
            if (findAsset(request, InspectionAssetType.SIGNATURE, signatureOrder).isEmpty()) {
                throw new IllegalArgumentException("Ainda falta enviar a assinatura do associado.");
            }
            int vehicleDocumentOrder = requiredPhotos + 3;
            if (findAsset(request, InspectionAssetType.VEHICLE_DOCUMENT, vehicleDocumentOrder).isEmpty()) {
                throw new IllegalArgumentException("Ainda falta enviar o CRLV do veículo.");
            }
            int identityDocumentOrder = requiredPhotos + 4;
            if (findAsset(request, InspectionAssetType.IDENTITY_DOCUMENT, identityDocumentOrder).isEmpty()) {
                throw new IllegalArgumentException("Ainda falta enviar o RG ou a CNH do associado.");
            }
        }

        int videoOrder = newInspection ? requiredPhotos + 1 : 1;
        if (findAsset(request, InspectionAssetType.VIDEO, videoOrder).isEmpty()) {
            throw new IllegalArgumentException("Ainda falta enviar o vídeo da vistoria.");
        }

        repository.saveAndFlush(request);
        request.getAssets().stream()
                .filter(asset -> asset.getAssetType() != InspectionAssetType.REPORT)
                .forEach(asset -> {
                    if (!storageService.isAvailable(asset)) {
                        throw new IllegalArgumentException("Um dos arquivos enviados não está disponível no banco de dados.");
                    }
                });

        byte[] reportBytes = pdfService.generate(request);
        int reportOrder = newInspection ? requiredPhotos + 5 : 2;
        storageService.storeBytes(
                request,
                InspectionAssetType.REPORT,
                "Relatório da vistoria",
                "relatorio-retrato-nh.pdf",
                "application/pdf",
                reportOrder,
                reportBytes
        );
        request.complete();
        repository.saveAndFlush(request);
        deleteInspectionUploadsQuietly(token);
        return completedUploadResponse(request);
    }

    private InspectionUploadResponse completedUploadResponse(InspectionRequest request) {
        InspectionResponse response = retratoService.toResponse(request);
        return new InspectionUploadResponse(
                response,
                null,
                null,
                false,
                "Envio manual pelo consultor."
        );
    }

    private ChunkUploadResponse completedChunkResponse(
            InspectionRequest request,
            InspectionAssetType assetType,
            int sortOrder,
            int totalChunks
    ) {
        return new ChunkUploadResponse(
                true,
                totalChunks,
                totalChunks,
                assetType,
                sortOrder,
                retratoService.toResponse(request)
        );
    }

    private void validateRequestAvailable(InspectionRequest request) {
        if (request.getStatus() != InspectionRequestStatus.WAITING_FILES
                && request.getStatus() != InspectionRequestStatus.UPLOADING_FILES
                && request.getStatus() != InspectionRequestStatus.CREATED
                && request.getStatus() != InspectionRequestStatus.UNDER_REVIEW) {
            throw new IllegalArgumentException("Esta solicitação não está disponível para novos envios.");
        }
        if (request.isExpired()) {
            throw new IllegalArgumentException("Este link de vistoria expirou. Solicite um novo link ao consultor.");
        }
    }

    private boolean isCompleted(InspectionRequest request) {
        return request.getStatus() == InspectionRequestStatus.COMPLETED
                || request.getStatus() == InspectionRequestStatus.APPROVED
                || request.getStatus() == InspectionRequestStatus.REJECTED;
    }

    private String validateAssetMetadata(
            InspectionRequest request,
            InspectionAssetType assetType,
            int sortOrder,
            String label,
            long totalSize,
            String contentType
    ) {
        if (assetType == null) {
            throw new IllegalArgumentException("Informe o tipo do arquivo.");
        }
        if (totalSize <= 0) {
            throw new IllegalArgumentException("O arquivo enviado está vazio.");
        }

        boolean newInspection = request.getRequestType() == InspectionRequestType.NEW_INSPECTION;
        int requiredPhotos = request.getVehicleType().requiredPhotoCount();
        int videoOrder = newInspection ? requiredPhotos + 1 : 1;
        int signatureOrder = requiredPhotos + 2;
        int vehicleDocumentOrder = requiredPhotos + 3;
        int identityDocumentOrder = requiredPhotos + 4;

        switch (assetType) {
            case PHOTO -> {
                if (!newInspection || sortOrder < 1 || sortOrder > requiredPhotos) {
                    throw new IllegalArgumentException("A posição da foto é inválida para esta vistoria.");
                }
                if (totalSize > MAX_PHOTO_BYTES) {
                    throw new IllegalArgumentException("Cada foto deve possuir no máximo 12 MB.");
                }
                if (!PHOTO_TYPES.contains(contentType)) {
                    throw new IllegalArgumentException("Envie fotos JPG, PNG ou WebP.");
                }
            }
            case VIDEO -> {
                if (sortOrder != videoOrder) {
                    throw new IllegalArgumentException("A posição do vídeo é inválida para esta vistoria.");
                }
                if (totalSize > MAX_VIDEO_BYTES) {
                    throw new IllegalArgumentException("O vídeo deve possuir no máximo 220 MB.");
                }
                if (!VIDEO_TYPES.contains(contentType)) {
                    throw new IllegalArgumentException("Envie o vídeo em MP4, MOV, WebM ou 3GP.");
                }
            }
            case SIGNATURE -> {
                if (!newInspection || sortOrder != signatureOrder) {
                    throw new IllegalArgumentException("A posição da assinatura é inválida para esta vistoria.");
                }
                if (totalSize > MAX_SIGNATURE_BYTES) {
                    throw new IllegalArgumentException("A assinatura deve possuir no máximo 3 MB.");
                }
                if (!PHOTO_TYPES.contains(contentType)) {
                    throw new IllegalArgumentException("A assinatura deve ser enviada como imagem PNG, JPG ou WebP.");
                }
            }
            case VEHICLE_DOCUMENT -> {
                if (!newInspection || sortOrder != vehicleDocumentOrder) {
                    throw new IllegalArgumentException("A posição do CRLV é inválida para esta vistoria.");
                }
                validateDocument(totalSize, contentType, "CRLV do veículo");
            }
            case IDENTITY_DOCUMENT -> {
                if (!newInspection || sortOrder != identityDocumentOrder) {
                    throw new IllegalArgumentException("A posição do documento pessoal é inválida para esta vistoria.");
                }
                validateDocument(totalSize, contentType, "RG ou CNH do associado");
            }
            case REPORT -> throw new IllegalArgumentException("O relatório é gerado automaticamente pelo sistema.");
        }

        String cleanLabel = label == null ? "" : label.trim().replaceAll("\\s+", " ");
        if (cleanLabel.isBlank()) {
            cleanLabel = switch (assetType) {
                case PHOTO -> "Foto " + sortOrder;
                case VIDEO -> "Vídeo da vistoria";
                case SIGNATURE -> "Assinatura do associado";
                case VEHICLE_DOCUMENT -> "CRLV do veículo";
                case IDENTITY_DOCUMENT -> "RG ou CNH do associado";
                case REPORT -> "Relatório da vistoria";
            };
        }
        if (cleanLabel.length() > 140) {
            cleanLabel = cleanLabel.substring(0, 140);
        }
        return cleanLabel;
    }

    private void validateDocument(long totalSize, String contentType, String documentName) {
        if (totalSize > MAX_DOCUMENT_BYTES) {
            throw new IllegalArgumentException(documentName + " deve possuir no máximo 18 MB.");
        }
        if (!DOCUMENT_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Envie " + documentName + " em PDF, JPG, PNG ou WebP.");
        }
    }

    private void validateChunk(String uploadId, int chunkIndex, int totalChunks, MultipartFile chunk) {
        sanitizeUploadId(uploadId);
        if (totalChunks < 1 || totalChunks > MAX_CHUNKS) {
            throw new IllegalArgumentException("Quantidade de partes do arquivo inválida.");
        }
        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
            throw new IllegalArgumentException("Parte do arquivo inválida.");
        }
        if (chunk == null || chunk.isEmpty()) {
            throw new IllegalArgumentException("Uma das partes do arquivo está vazia.");
        }
        if (chunk.getSize() > MAX_CHUNK_BYTES) {
            throw new IllegalArgumentException("Cada parte do envio deve possuir no máximo 6 MB.");
        }
    }

    private InspectionRequest findByToken(String token) {
        return repository.findByPublicToken(token)
                .orElseThrow(() -> new IllegalArgumentException("Link de vistoria inválido."));
    }

    private Optional<InspectionAsset> findAsset(
            InspectionRequest request,
            InspectionAssetType type,
            int sortOrder
    ) {
        return request.getAssets().stream()
                .filter(asset -> asset.getAssetType() == type && asset.getSortOrder() == sortOrder)
                .findFirst();
    }

    private Path uploadDirectory(String token, String uploadId) {
        Path inspectionDirectory = uploadRoot.resolve(hash(token));
        Path directory = inspectionDirectory.resolve(uploadId).normalize();
        if (!directory.startsWith(uploadRoot)) {
            throw new IllegalArgumentException("Identificador de envio inválido.");
        }
        return directory;
    }

    private void persistChunk(Path directory, int chunkIndex, MultipartFile chunk) {
        try {
            Files.createDirectories(directory);
            Path destination = directory.resolve(String.format(Locale.ROOT, "%06d.part", chunkIndex));
            Path temporary = directory.resolve(String.format(Locale.ROOT, "%06d.tmp-%s", chunkIndex, java.util.UUID.randomUUID()));
            try (InputStream input = chunk.getInputStream()) {
                Files.copy(input, temporary, StandardCopyOption.REPLACE_EXISTING);
            }
            try {
                Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível guardar uma parte do arquivo para continuar o envio.", exception);
        }
    }

    private int countReceivedChunks(Path directory, int totalChunks) {
        int received = 0;
        for (int index = 0; index < totalChunks; index++) {
            if (Files.isRegularFile(directory.resolve(String.format(Locale.ROOT, "%06d.part", index)))) {
                received++;
            }
        }
        return received;
    }

    private Path assemble(Path directory, int totalChunks, long expectedSize) {
        Path assembled = directory.resolve("assembled.upload");
        try (OutputStream output = new BufferedOutputStream(Files.newOutputStream(
                assembled,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING,
                StandardOpenOption.WRITE
        ))) {
            for (int index = 0; index < totalChunks; index++) {
                Path part = directory.resolve(String.format(Locale.ROOT, "%06d.part", index));
                if (!Files.isRegularFile(part)) {
                    throw new IllegalArgumentException("O envio ainda possui partes pendentes.");
                }
                Files.copy(part, output);
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível reunir as partes do arquivo enviado.", exception);
        }

        try {
            if (Files.size(assembled) != expectedSize) {
                Files.deleteIfExists(assembled);
                throw new IllegalArgumentException("O arquivo chegou incompleto. Tente enviar novamente.");
            }
            return assembled;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível validar o arquivo recebido.", exception);
        }
    }

    private String buildFileName(
            InspectionAssetType assetType,
            int sortOrder,
            String label,
            String contentType
    ) {
        String base = switch (assetType) {
            case PHOTO -> slug(label);
            case VIDEO -> "video-vistoria";
            case SIGNATURE -> "assinatura-associado";
            case VEHICLE_DOCUMENT -> "crlv-veiculo";
            case IDENTITY_DOCUMENT -> "rg-cnh-associado";
            case REPORT -> "relatorio-retrato-nh";
        };
        return String.format(Locale.ROOT, "%02d-%s%s", sortOrder, base, extension(contentType));
    }

    private String extension(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "video/quicktime" -> ".mov";
            case "video/webm" -> ".webm";
            case "video/3gpp" -> ".3gp";
            case "video/mp4" -> ".mp4";
            case "application/pdf" -> ".pdf";
            default -> ".jpg";
        };
    }

    private String slug(String value) {
        String slug = value.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return slug.isBlank() ? "arquivo" : slug;
    }

    private String cleanType(String contentType) {
        return contentType == null
                ? ""
                : contentType.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
    }

    private String sanitizeUploadId(String uploadId) {
        String clean = uploadId == null ? "" : uploadId.trim();
        if (!clean.matches("^[A-Za-z0-9_-]{8,140}$")) {
            throw new IllegalArgumentException("Identificador de envio inválido.");
        }
        return clean;
    }

    private String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível preparar o envio.", exception);
        }
    }

    private void deleteInspectionUploadsQuietly(String token) {
        deleteDirectoryQuietly(uploadRoot.resolve(hash(token)));
    }

    private void deleteDirectoryQuietly(Path directory) {
        if (directory == null || !Files.exists(directory)) {
            return;
        }
        try (Stream<Path> stream = Files.walk(directory)) {
            stream.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (Exception ignored) {
                    // A limpeza temporária não pode invalidar um arquivo já salvo no banco de dados.
                }
            });
        } catch (Exception ignored) {
            // A limpeza temporária não pode invalidar um arquivo já salvo no banco de dados.
        }
    }

    private void cleanupStaleUploadsIfNeeded() {
        long now = System.currentTimeMillis();
        long previous = lastCleanupAt.get();
        if (now - previous < CLEANUP_INTERVAL.toMillis() || !lastCleanupAt.compareAndSet(previous, now)) {
            return;
        }
        if (!Files.isDirectory(uploadRoot)) {
            return;
        }
        OffsetDateTime cutoff = OffsetDateTime.now().minus(STALE_UPLOAD_AGE);
        try (Stream<Path> directories = Files.list(uploadRoot)) {
            directories.filter(Files::isDirectory).forEach(directory -> {
                try {
                    OffsetDateTime modified = OffsetDateTime.ofInstant(
                            Files.getLastModifiedTime(directory).toInstant(),
                            java.time.ZoneOffset.UTC
                    );
                    if (modified.isBefore(cutoff)) {
                        deleteDirectoryQuietly(directory);
                    }
                } catch (Exception ignored) {
                    // A limpeza será tentada novamente em outro envio.
                }
            });
        } catch (Exception ignored) {
            // A limpeza será tentada novamente em outro envio.
        }
    }
}
