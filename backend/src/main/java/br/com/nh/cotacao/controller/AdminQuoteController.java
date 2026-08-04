package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.QuoteDtos.QuoteResponse;
import br.com.nh.cotacao.service.QuoteService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/quotes")
public class AdminQuoteController {
    private final QuoteService quoteService;

    public AdminQuoteController(QuoteService quoteService) {
        this.quoteService = quoteService;
    }

    @GetMapping
    public List<QuoteResponse> list() {
        return quoteService.adminList();
    }
}
