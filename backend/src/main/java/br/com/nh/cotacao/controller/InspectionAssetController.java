package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.InspectionAssetStorageService;
import br.com.nh.cotacao.service.PortalUserService;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
public class InspectionAssetController {
    private final InspectionAssetStorageService storageService;
    private final PortalUserService portalUserService;

    public InspectionAssetController(InspectionAssetStorageService storageService, PortalUserService portalUserService) {
        this.storageService = storageService;
        this.portalUserService = portalUserService;
    }

    @GetMapping({
            "/api/analysis/inspections/{inspectionId}/assets.zip",
            "/api/admin/inspections/{inspectionId}/assets.zip",
            "/api/consultant-dashboard/inspections/{inspectionId}/assets.zip"
    })
    public ResponseEntity<StreamingResponseBody> downloadAll(
            @PathVariable UUID inspectionId, Authentication auth, HttpServletRequest request
    ) {
        assertConsultantInspectionAccessIfNeeded(request, auth, inspectionId);
        StreamingResponseBody body = output -> storageService.writeInspectionZip(inspectionId, output);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename("arquivos-vistoria-" + inspectionId + ".zip", StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .cacheControl(CacheControl.noStore().mustRevalidate())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(body);
    }

    @DeleteMapping({
            "/api/analysis/inspections/{inspectionId}/assets/{assetId}",
            "/api/admin/inspections/{inspectionId}/assets/{assetId}"
    })
    public ResponseEntity<Void> deleteInspectionAsset(
            @PathVariable UUID inspectionId,
            @PathVariable UUID assetId
    ) {
        storageService.deleteAsset(inspectionId, assetId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping({
            "/api/analysis/inspections/{inspectionId}/assets/{assetId}",
            "/api/admin/inspections/{inspectionId}/assets/{assetId}",
            "/api/consultant-dashboard/inspections/{inspectionId}/assets/{assetId}"
    })
    public ResponseEntity<StreamingResponseBody> content(
            @PathVariable UUID inspectionId,
            @PathVariable UUID assetId,
            @RequestParam(defaultValue = "false") boolean download,
            Authentication auth,
            HttpServletRequest request
    ) {
        assertConsultantInspectionAccessIfNeeded(request, auth, inspectionId);
        InspectionAsset asset = storageService.requireAvailable(inspectionId, assetId);
        boolean compressedVideoDownload = download && storageService.requiresVideoDownloadCompression(asset);
        MediaType mediaType;
        try {
            mediaType = compressedVideoDownload
                    ? MediaType.parseMediaType("video/mp4")
                    : MediaType.parseMediaType(asset.getContentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        String responseFileName = compressedVideoDownload
                ? storageService.downloadFileName(asset)
                : asset.getFileName();
        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(responseFileName, StandardCharsets.UTF_8)
                .build();

        StreamingResponseBody body = output -> {
            if (download) storageService.writeForDownload(asset, output);
            else storageService.writeTo(assetId, output);
        };
        ResponseEntity.BodyBuilder response = ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.noStore().mustRevalidate())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff");
        if (!compressedVideoDownload) response.contentLength(asset.getFileSize());
        return response.body(body);
    }

    private void assertConsultantInspectionAccessIfNeeded(
            HttpServletRequest request, Authentication auth, UUID inspectionId
    ) {
        if (request == null || !request.getRequestURI().startsWith("/api/consultant-dashboard/")) return;
        PortalPrincipal principal = (PortalPrincipal) auth.getPrincipal();
        portalUserService.assertInspectionAccess(principal.username(), principal.role(), inspectionId);
    }
}
