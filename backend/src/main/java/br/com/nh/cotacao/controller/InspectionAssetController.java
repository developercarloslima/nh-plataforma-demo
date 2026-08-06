package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.entity.InspectionAsset;
import br.com.nh.cotacao.service.InspectionAssetStorageService;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
public class InspectionAssetController {
    private final InspectionAssetStorageService storageService;

    public InspectionAssetController(InspectionAssetStorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping({
            "/api/analysis/inspections/{inspectionId}/assets.zip",
            "/api/admin/inspections/{inspectionId}/assets.zip",
            "/api/consultant-dashboard/inspections/{inspectionId}/assets.zip"
    })
    public ResponseEntity<StreamingResponseBody> downloadAll(@PathVariable UUID inspectionId) {
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

    @GetMapping({
            "/api/analysis/inspections/{inspectionId}/assets/{assetId}",
            "/api/admin/inspections/{inspectionId}/assets/{assetId}",
            "/api/consultant-dashboard/inspections/{inspectionId}/assets/{assetId}"
    })
    public ResponseEntity<StreamingResponseBody> content(
            @PathVariable UUID inspectionId,
            @PathVariable UUID assetId,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        InspectionAsset asset = storageService.requireAvailable(inspectionId, assetId);
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(asset.getContentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(asset.getFileName(), StandardCharsets.UTF_8)
                .build();

        StreamingResponseBody body = output -> storageService.writeTo(assetId, output);
        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(asset.getFileSize())
                .cacheControl(CacheControl.noStore().mustRevalidate())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(body);
    }
}
