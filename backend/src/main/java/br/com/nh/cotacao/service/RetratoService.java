package br.com.nh.cotacao.service;

import br.com.nh.cotacao.dto.InspectionDtos.*;
import br.com.nh.cotacao.entity.*;
import br.com.nh.cotacao.repository.InspectionRequestRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class RetratoService {
    private static final String DEFAULT_PUBLIC_WEB_URL = "https://aforma-demo.vercel.app";
    private static final long MAX_PHOTO_BYTES = 12L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 220L * 1024 * 1024;
    private static final long MAX_SIGNATURE_BYTES = 3L * 1024 * 1024;
    private static final Set<String> PHOTO_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final Set<String> VIDEO_TYPES = Set.of("video/mp4", "video/quicktime", "video/webm", "video/3gpp");

    private final InspectionRequestRepository repository;
    private final ConsultantService consultantService;
    private final GoogleDriveStorageService driveStorage;
    private final RetratoPdfService pdfService;
    private final String publicWebUrl;
    private final CommunicationSettingsService communicationSettings;

    public RetratoService(
            InspectionRequestRepository repository,
            ConsultantService consultantService,
            GoogleDriveStorageService driveStorage,
            RetratoPdfService pdfService,
            CommunicationSettingsService communicationSettings,
            @Value("${app.public-web-url:https://aforma-demo.vercel.app}") String publicWebUrl
    ) {
        this.repository = repository;
        this.consultantService = consultantService;
        this.driveStorage = driveStorage;
        this.pdfService = pdfService;
        this.publicWebUrl = normalizePublicWebUrl(publicWebUrl);
        this.communicationSettings = communicationSettings;
    }

    @Transactional
    public InspectionResponse create(CreateInspectionRequest input) {
        String cpf = input.cpf().replaceAll("\\D", "");
        if (!validCpf(cpf)) throw new IllegalArgumentException("Informe um CPF válido.");
        Consultant consultant = consultantService.findActive(input.consultantId());
        boolean zeroKm = input.requestType() == InspectionRequestType.NEW_INSPECTION && input.zeroKm();
        String plate = validateAndNormalizeManualPlate(input.plate(), input.requestType(), zeroKm);
        InspectionRequest request = InspectionRequest.create(
                randomToken(),
                input.requestType(),
                input.associateName(),
                cpf,
                input.whatsapp(),
                plate,
                input.vehicleType() == null ? InspectionVehicleType.FOUR_WHEELS_OR_MORE : input.vehicleType(),
                consultant
        );
        return toResponse(repository.save(request));
    }

    @Transactional
    public InspectionResponse ensureForSelfServiceQuote(Quotation quotation) {
        if (quotation == null || quotation.getOrigin() != QuoteOrigin.SELF_SERVICE) {
            throw new IllegalArgumentException("A vistoria automática exige uma cotação feita pelo cliente.");
        }
        return repository.findByQuotation_Id(quotation.getId())
                .map(this::toResponse)
                .orElseGet(() -> toResponse(repository.save(
                        InspectionRequest.createForSelfServiceQuote(randomToken(), quotation)
                )));
    }

    @Transactional(readOnly = true)
    public Optional<InspectionResponse> findForQuotation(UUID quotationId) {
        return repository.findByQuotation_Id(quotationId).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public InspectionResponse publicGet(String token) {
        return toResponse(findByToken(token));
    }

    @Transactional(readOnly = true)
    public List<InspectionResponse> adminList() {
        return repository.findTop300ByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional
    public InspectionUploadResponse upload(
            String token,
            List<MultipartFile> photos,
            List<String> labels,
            MultipartFile video,
            String residenceAddress,
            MultipartFile signature
    ) {
        InspectionRequest request = findByToken(token);
        if (request.getStatus() != InspectionRequestStatus.CREATED
                && request.getStatus() != InspectionRequestStatus.UNDER_REVIEW) {
            throw new IllegalArgumentException("Esta solicitação não está disponível para novos envios.");
        }
        if (request.isExpired()) {
            throw new IllegalArgumentException("Este link de vistoria expirou. Solicite um novo link ao consultor.");
        }
        if (video == null || video.isEmpty()) {
            throw new IllegalArgumentException("O vídeo da vistoria é obrigatório.");
        }
        validateVideo(video);

        boolean newInspection = request.getRequestType() == InspectionRequestType.NEW_INSPECTION;
        if (newInspection) {
            request.registerResidenceAddress(residenceAddress);
            if (signature == null || signature.isEmpty()) {
                throw new IllegalArgumentException("A assinatura do associado é obrigatória para concluir o cadastro.");
            }
            validateSignature(signature);
        }

        List<MultipartFile> safePhotos = photos == null ? List.of() : photos.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        int requiredPhotoCount = request.getVehicleType().requiredPhotoCount();
        if (newInspection && safePhotos.size() != requiredPhotoCount) {
            throw new IllegalArgumentException(
                    "A nova vistoria para " + request.getVehicleType().displayName().toLowerCase(Locale.ROOT)
                            + " exige exatamente " + requiredPhotoCount + " fotos obrigatórias e o vídeo."
            );
        }
        safePhotos.forEach(this::validatePhoto);

        String date = request.getCreatedAt().format(DateTimeFormatter.ofPattern("dd-MM-yyyy"));
        String type = request.getRequestType() == InspectionRequestType.NEW_INSPECTION ? "Nova vistoria" : "Atualização de boleto";
        var folder = driveStorage.createFolder(request.getAssociateName() + " - " + vehiclePlateLabel(request) + " - " + type + " - " + date);
        request.registerFolder(folder.id(), folder.url());

        int order = 1;
        for (MultipartFile photo : safePhotos) {
            String label = labelAt(labels, order - 1, "Foto " + order);
            String extension = extension(photo.getContentType(), ".jpg");
            String fileName = String.format(Locale.ROOT, "%02d-%s%s", order, slug(label), extension);
            var file = driveStorage.upload(folder.id(), fileName, photo.getContentType(), bytes(photo));
            request.addAsset(InspectionAsset.create(
                    request, InspectionAssetType.PHOTO, label, fileName, photo.getContentType(), photo.getSize(), order,
                    file.id(), file.viewUrl()
            ));
            order++;
        }

        String videoExtension = extension(video.getContentType(), ".mp4");
        String videoName = String.format(Locale.ROOT, "%02d-video-vistoria%s", order, videoExtension);
        var videoFile = driveStorage.upload(folder.id(), videoName, video.getContentType(), bytes(video));
        request.addAsset(InspectionAsset.create(
                request, InspectionAssetType.VIDEO, "Vídeo da vistoria", videoName, video.getContentType(), video.getSize(), order,
                videoFile.id(), videoFile.viewUrl()
        ));
        order++;

        if (newInspection) {
            String signatureType = cleanType(signature.getContentType());
            String signatureName = String.format(Locale.ROOT, "%02d-assinatura-associado%s", order, extension(signatureType, ".png"));
            var signatureFile = driveStorage.upload(folder.id(), signatureName, signatureType, bytes(signature));
            request.addAsset(InspectionAsset.create(
                    request, InspectionAssetType.SIGNATURE, "Assinatura do associado", signatureName,
                    signatureType, signature.getSize(), order, signatureFile.id(), signatureFile.viewUrl()
            ));
        }

        repository.saveAndFlush(request);
        byte[] reportBytes = pdfService.generate(request);
        var report = driveStorage.upload(folder.id(), "relatorio-retrato-nh.pdf", "application/pdf", reportBytes);
        request.complete(report.id(), report.viewUrl());
        repository.save(request);

        InspectionResponse response = toResponse(request);
        return new InspectionUploadResponse(
                response, request.getDriveFolderUrl(), request.getReportUrl(),
                false, "Envio manual pelo consultor."
        );
    }

    private InspectionRequest findByToken(String token) {
        return repository.findByPublicToken(token)
                .orElseThrow(() -> new IllegalArgumentException("Link de vistoria inválido."));
    }

    public InspectionResponse toResponse(InspectionRequest request) {
        String publicUrl = publicWebUrl + "/retrato/?token=" + request.getPublicToken();
        String whatsappUrl = null;
        if (request.getWhatsapp() != null && !request.getWhatsapp().isBlank()) {
            String message = "Olá, " + request.getAssociateName() + "! Acesse o link abaixo para realizar "
                    + (request.getRequestType() == InspectionRequestType.NEW_INSPECTION
                    ? "a vistoria digital completa" : "o vídeo para atualização de boleto")
                    + " do veículo " + vehiclePlateLabel(request) + ":\n" + publicUrl;
            whatsappUrl = "https://wa.me/55" + normalizeBrazilPhone(request.getWhatsapp())
                    + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);
        }
        String associateCompletionWhatsappUrl = buildAssociateCompletionWhatsappUrl(request);
        String teamWhatsappUrl = null;
        String teamWhatsappNumber = communicationSettings.teamWhatsapp();
        if (teamWhatsappNumber != null && !teamWhatsappNumber.isBlank()) {
            String requestTypeLabel = request.getRequestType() == InspectionRequestType.NEW_INSPECTION
                    ? "Nova vistoria" : "Atualização de boleto";
            String teamMessage;

            if (request.getDriveFolderUrl() == null) {
                teamMessage = "Nova solicitação do Retrato NH\n\nAssociado: " + request.getAssociateName()
                        + "\nPlaca: " + vehiclePlateLabel(request)
                        + "\nWhatsApp do associado: " + visiblePhone(request.getWhatsapp())
                        + "\nConsultor: " + request.getConsultantName()
                        + "\nTipo: " + requestTypeLabel
                        + "\n\nLink para o associado: " + publicUrl;
            } else {
                teamMessage = "Retrato NH concluído\n\nAssociado: " + request.getAssociateName()
                        + "\nPlaca: " + vehiclePlateLabel(request)
                        + "\nConsultor: " + request.getConsultantName()
                        + "\nTipo: " + requestTypeLabel
                        + "\n\nPasta no Drive: " + request.getDriveFolderUrl()
                        + (request.getReportUrl() == null ? "" : "\nRelatório: " + request.getReportUrl());
            }

            teamWhatsappUrl = "https://wa.me/" + teamWhatsappNumber + "?text="
                    + URLEncoder.encode(teamMessage, StandardCharsets.UTF_8);
        }
        List<InspectionAssetResponse> assets = request.getAssets().stream()
                .map(asset -> new InspectionAssetResponse(
                        asset.getId(), asset.getAssetType(), asset.getLabel(), asset.getFileName(),
                        asset.getDriveFileUrl(), asset.getSortOrder()
                )).toList();
        return new InspectionResponse(
                request.getId(), request.getPublicToken(), request.getRequestType(), request.getVehicleType(), request.getAssociateName(),
                maskCpf(request.getCpf()), request.getWhatsapp(), request.getPlate(), request.getResidenceAddress(),
                request.getConsultant() == null ? null : request.getConsultant().getId(),
                request.getConsultantName(), request.getStatus(), request.getCreatedAt(), request.getExpiresAt(),
                request.getCompletedAt(), publicUrl, whatsappUrl, teamWhatsappUrl, associateCompletionWhatsappUrl,
                request.getDriveFolderUrl(), request.getReportUrl(), assets
        );
    }

    private String buildAssociateCompletionWhatsappUrl(InspectionRequest request) {
        if (request.getWhatsapp() == null || request.getWhatsapp().isBlank()) return null;
        String phone = request.getWhatsapp().replaceAll("\\D", "");
        if (phone.length() == 10 || phone.length() == 11) phone = "55" + phone;
        if (!phone.matches("^[1-9][0-9]{11,14}$")) return null;
        String message = "Olá, " + request.getAssociateName().trim().split("\\s+")[0]
                + "! Sua vistoria foi realizada com sucesso. Aguarde a análise da equipe Novo Horizonte Proteção Veicular.";
        return "https://wa.me/" + phone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);
    }

    private String validateAndNormalizeManualPlate(
            String plate,
            InspectionRequestType requestType,
            boolean zeroKm
    ) {
        if (requestType == InspectionRequestType.NEW_INSPECTION && zeroKm) {
            return null;
        }

        String normalized = plate == null ? "" : plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        if (!normalized.matches("^[A-Z0-9]{7,10}$")) {
            throw new IllegalArgumentException(requestType == InspectionRequestType.NEW_INSPECTION
                    ? "Informe a placa do veículo ou marque Sim em veículo 0 km."
                    : "Informe a placa do veículo para atualização de boleto.");
        }
        return normalized;
    }

    private void validatePhoto(MultipartFile file) {
        if (file.getSize() > MAX_PHOTO_BYTES) throw new IllegalArgumentException("Cada foto deve possuir no máximo 12 MB.");
        if (!PHOTO_TYPES.contains(cleanType(file.getContentType()))) throw new IllegalArgumentException("Envie fotos JPG, PNG ou WebP.");
    }

    private void validateVideo(MultipartFile file) {
        if (file.getSize() > MAX_VIDEO_BYTES) throw new IllegalArgumentException("O vídeo deve possuir no máximo 220 MB.");
        if (!VIDEO_TYPES.contains(cleanType(file.getContentType()))) throw new IllegalArgumentException("Envie o vídeo em MP4, MOV, WebM ou 3GP.");
    }

    private void validateSignature(MultipartFile file) {
        if (file.getSize() > MAX_SIGNATURE_BYTES) {
            throw new IllegalArgumentException("A assinatura deve possuir no máximo 3 MB.");
        }
        if (!PHOTO_TYPES.contains(cleanType(file.getContentType()))) {
            throw new IllegalArgumentException("A assinatura deve ser enviada como imagem PNG, JPG ou WebP.");
        }
    }

    private byte[] bytes(MultipartFile file) {
        try { return file.getBytes(); }
        catch (Exception exception) { throw new IllegalArgumentException("Não foi possível ler um dos arquivos enviados."); }
    }

    private String randomToken() {
        String raw = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private String labelAt(List<String> labels, int index, String fallback) {
        if (labels == null || index >= labels.size() || labels.get(index) == null || labels.get(index).isBlank()) return fallback;
        return labels.get(index).trim();
    }

    private String extension(String type, String fallback) {
        return switch (cleanType(type)) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "video/quicktime" -> ".mov";
            case "video/webm" -> ".webm";
            case "video/3gpp" -> ".3gp";
            case "video/mp4" -> ".mp4";
            default -> fallback;
        };
    }

    private String cleanType(String type) { return type == null ? "" : type.toLowerCase(Locale.ROOT).split(";")[0]; }
    private String slug(String value) { return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", ""); }
    private String stripTrailingSlash(String value) { return value == null ? "" : value.replaceAll("/+$", ""); }
    private String normalizePublicWebUrl(String value) {
        String normalized = stripTrailingSlash(value);
        if (normalized.isBlank() || normalized.matches("(?i)^https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?$")) {
            return DEFAULT_PUBLIC_WEB_URL;
        }
        return normalized;
    }
    private String vehiclePlateLabel(InspectionRequest request) {
        return request.getPlate() == null || request.getPlate().isBlank() ? "Veículo 0 km — sem placa" : request.getPlate();
    }
    private String maskCpf(String cpf) { return cpf.length() == 11 ? "***." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-**" : "***.***.***-**"; }
    private String visiblePhone(String value) {
        if (value == null || value.isBlank()) return "Não informado";
        return value.replaceAll("\\D", "");
    }
    private String normalizeBrazilPhone(String value) {
        String digits = value.replaceAll("\\D", "");
        if (digits.startsWith("55") && digits.length() >= 12) return digits.substring(2);
        return digits;
    }

    private boolean validCpf(String cpf) {
        if (cpf == null || !cpf.matches("\\d{11}") || cpf.chars().distinct().count() == 1) return false;
        try {
            int sum = 0;
            for (int i = 0; i < 9; i++) sum += Character.digit(cpf.charAt(i), 10) * (10 - i);
            int first = 11 - (sum % 11); if (first >= 10) first = 0;
            sum = 0;
            for (int i = 0; i < 10; i++) sum += Character.digit(cpf.charAt(i), 10) * (11 - i);
            int second = 11 - (sum % 11); if (second >= 10) second = 0;
            return first == Character.digit(cpf.charAt(9), 10) && second == Character.digit(cpf.charAt(10), 10);
        } catch (Exception ignored) { return false; }
    }
}
