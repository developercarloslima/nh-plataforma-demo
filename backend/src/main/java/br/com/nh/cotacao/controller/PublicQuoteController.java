package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.QuoteDtos.*;
import br.com.nh.cotacao.service.QuoteService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/public/quotes")
public class PublicQuoteController {
    private final QuoteService quoteService;

    public PublicQuoteController(QuoteService quoteService) {
        this.quoteService = quoteService;
    }

    @PostMapping("/options")
    public OptionsResponse options(@Valid @RequestBody OptionsRequest request) {
        return quoteService.options(request);
    }

    @PostMapping
    public ResponseEntity<QuoteResponse> create(@Valid @RequestBody CreatePublicQuoteRequest request) {
        return ResponseEntity.status(201).body(quoteService.createPublic(request));
    }

    @GetMapping("/{id}")
    public QuoteResponse get(@PathVariable UUID id) {
        return quoteService.getPublic(id);
    }

    @PostMapping("/{id}/decision")
    public DecisionResponse decide(@PathVariable UUID id, @Valid @RequestBody DecisionRequest request) {
        return quoteService.decidePublic(id, request);
    }
}
