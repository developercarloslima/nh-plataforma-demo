package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.QuoteDtos.*;
import br.com.nh.cotacao.service.InspectionService;
import br.com.nh.cotacao.service.QuotePdfService;
import br.com.nh.cotacao.service.QuoteService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/quotes")
public class QuoteController {

    private final QuoteService quoteService;
    private final QuotePdfService pdfService;
    private final InspectionService inspectionService;

    public QuoteController(
            QuoteService quoteService,
            QuotePdfService pdfService,
            InspectionService inspectionService
    ) {
        this.quoteService = quoteService;
        this.pdfService = pdfService;
        this.inspectionService = inspectionService;
    }

    @PostMapping("/options")
    public OptionsResponse options(@Valid @RequestBody OptionsRequest request) {
        return quoteService.options(request);
    }

    @PostMapping
    public ResponseEntity<QuoteResponse> create(@Valid @RequestBody CreateQuoteRequest request) {
        return ResponseEntity.status(201).body(quoteService.create(request));
    }

    @GetMapping("/{id}")
    public QuoteResponse get(@PathVariable UUID id) {
        return quoteService.get(id);
    }

    @PostMapping("/{id}/decision")
    public DecisionResponse decide(@PathVariable UUID id, @Valid @RequestBody DecisionRequest request) {
        return quoteService.decide(id, request);
    }

    @PostMapping(value = "/{id}/inspection", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public InspectionUploadResponse uploadInspection(
            @PathVariable UUID id,
            @RequestParam("photos") List<MultipartFile> photos,
            @RequestParam("labels") List<String> labels
    ) {
        return inspectionService.upload(id, photos, labels);
    }

    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable UUID id) {
        var quote = quoteService.find(id);
        byte[] bytes = pdfService.generate(quote);
        String filename = "cotacao-" + quote.getQuoteNumber() + ".pdf";
        String disposition = ContentDisposition.attachment()
                .filename(filename, StandardCharsets.UTF_8)
                .build()
                .toString();

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(bytes.length)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(bytes);
    }
}
