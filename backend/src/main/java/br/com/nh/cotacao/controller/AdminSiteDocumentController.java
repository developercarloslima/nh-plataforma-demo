package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.SiteDocumentService;
import br.com.nh.cotacao.service.SiteDocumentService.DocumentMetadata;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/settings")
public class AdminSiteDocumentController {
    private final SiteDocumentService service;

    public AdminSiteDocumentController(SiteDocumentService service) {
        this.service = service;
    }

    @GetMapping("/regulation")
    public DocumentMetadata regulation() {
        return service.regulationMetadata();
    }

    @PutMapping(value = "/regulation", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentMetadata updateRegulation(
            @RequestPart("file") MultipartFile file,
            Authentication auth
    ) {
        return service.updateRegulation(file, ((PortalPrincipal) auth.getPrincipal()).username());
    }
}
