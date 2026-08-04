package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.InspectionDtos.*;
import br.com.nh.cotacao.service.RetratoService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
public class RetratoController {
    private final RetratoService service;

    public RetratoController(RetratoService service) { this.service = service; }

    @PostMapping("/api/inspections")
    @ResponseStatus(HttpStatus.CREATED)
    public InspectionResponse create(@Valid @RequestBody CreateInspectionRequest request) {
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
            @RequestParam("video") MultipartFile video
    ) {
        return service.upload(token, photos, labels, video);
    }

    @GetMapping("/api/admin/inspections")
    public List<InspectionResponse> adminList() { return service.adminList(); }
}
