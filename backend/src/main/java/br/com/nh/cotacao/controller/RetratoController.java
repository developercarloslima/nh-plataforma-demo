package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.InspectionDtos.*;
import br.com.nh.cotacao.entity.InspectionAssetType;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.InspectionResumableUploadService;
import br.com.nh.cotacao.service.PortalUserService;
import br.com.nh.cotacao.service.RetratoService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
public class RetratoController {
    private final RetratoService service;
    private final InspectionResumableUploadService resumableUploadService;
    private final PortalUserService portalUserService;

    public RetratoController(
            RetratoService service,
            InspectionResumableUploadService resumableUploadService,
            PortalUserService portalUserService
    ) {
        this.service = service;
        this.resumableUploadService = resumableUploadService;
        this.portalUserService = portalUserService;
    }

    @PostMapping("/api/inspections")
    @ResponseStatus(HttpStatus.CREATED)
    public InspectionResponse create(
            @Valid @RequestBody CreateInspectionRequest request, Authentication auth
    ) {
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        portalUserService.assertConsultantAccess(principal.username(), principal.role(), request.consultantId());
        return service.create(request);
    }

    @GetMapping("/api/public/inspections/{token}")
    public InspectionResponse publicGet(@PathVariable String token) {
        return service.publicGet(token);
    }

    @PostMapping(value = "/api/public/inspections/{token}/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public InspectionUploadResponse upload(
            @PathVariable String token,
            @RequestParam(value = "photos", required = false) List<MultipartFile> photos,
            @RequestParam(value = "labels", required = false) List<String> labels,
            @RequestParam("video") MultipartFile video,
            @RequestParam(value = "residenceAddress", required = false) String residenceAddress,
            @RequestParam(value = "signature", required = false) MultipartFile signature,
            @RequestParam(value = "vehicleDocument", required = false) MultipartFile vehicleDocument,
            @RequestParam(value = "identityDocumentFront", required = false) MultipartFile identityDocumentFront,
            @RequestParam(value = "identityDocumentBack", required = false) MultipartFile identityDocumentBack,
            @RequestParam(value = "additionalFiles", required = false) List<MultipartFile> additionalFiles,
            @RequestParam(value = "additionalLabels", required = false) List<String> additionalLabels
    ) {
        return service.upload(
                token, photos, labels, video, residenceAddress, signature,
                vehicleDocument, identityDocumentFront, identityDocumentBack, additionalFiles, additionalLabels
        );
    }

    @GetMapping("/api/public/inspections/{token}/upload-chunk-status")
    public ChunkUploadStatusResponse uploadChunkStatus(
            @PathVariable String token,
            @RequestParam InspectionAssetType assetType,
            @RequestParam int sortOrder,
            @RequestParam String uploadId,
            @RequestParam int totalChunks
    ) {
        return resumableUploadService.chunkStatus(token, assetType, sortOrder, uploadId, totalChunks);
    }

    @PostMapping(value = "/api/public/inspections/{token}/upload-chunk", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ChunkUploadResponse uploadChunk(
            @PathVariable String token,
            @RequestParam InspectionAssetType assetType,
            @RequestParam int sortOrder,
            @RequestParam String label,
            @RequestParam String uploadId,
            @RequestParam int chunkIndex,
            @RequestParam int totalChunks,
            @RequestParam long totalSize,
            @RequestParam String contentType,
            @RequestParam("chunk") MultipartFile chunk
    ) {
        return resumableUploadService.uploadChunk(
                token,
                assetType,
                sortOrder,
                label,
                uploadId,
                chunkIndex,
                totalChunks,
                totalSize,
                contentType,
                chunk
        );
    }

    @PostMapping("/api/public/inspections/{token}/finalize-upload")
    public InspectionUploadResponse finalizeUpload(
            @PathVariable String token,
            @RequestBody(required = false) FinishInspectionUploadRequest request
    ) {
        return resumableUploadService.finalizeUpload(
                token,
                request == null ? null : request.residenceAddress()
        );
    }

}
