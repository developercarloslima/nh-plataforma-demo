package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.ConsultantDashboardDtos.ConsultantDashboardResponse;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.ConsultantInspectionSummary;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.ConsultantQuoteSummary;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.ConsultantQuoteDecisionRequest;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.RedoQuoteRequest;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.StartInspectionRequest;
import br.com.nh.cotacao.dto.ConsultantDashboardDtos.UpdateQuoteDetailsRequest;
import br.com.nh.cotacao.service.ConsultantDashboardService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/consultant-dashboard")
public class ConsultantDashboardController {
    private final ConsultantDashboardService service;

    public ConsultantDashboardController(ConsultantDashboardService service) {
        this.service = service;
    }

    @GetMapping("/{consultantId}")
    public ConsultantDashboardResponse dashboard(@PathVariable UUID consultantId) {
        return service.dashboard(consultantId);
    }

    @PostMapping("/{consultantId}/quotes/{quoteId}/inspection")
    public ConsultantInspectionSummary ensureInspection(
            @PathVariable UUID consultantId,
            @PathVariable UUID quoteId,
            @Valid @RequestBody(required = false) StartInspectionRequest request
    ) {
        return service.ensureInspection(consultantId, quoteId, request == null ? null : request.cpf());
    }

    @PostMapping("/{consultantId}/quotes/{quoteId}/redo")
    @ResponseStatus(HttpStatus.CREATED)
    public ConsultantQuoteSummary redoQuote(
            @PathVariable UUID consultantId,
            @PathVariable UUID quoteId,
            @Valid @RequestBody(required = false) RedoQuoteRequest request
    ) {
        return service.redoQuote(consultantId, quoteId, request == null ? null : request.cpf());
    }

    @PatchMapping("/{consultantId}/quotes/{quoteId}")
    public ConsultantQuoteSummary updateQuoteDetails(
            @PathVariable UUID consultantId,
            @PathVariable UUID quoteId,
            @Valid @RequestBody UpdateQuoteDetailsRequest request
    ) {
        return service.updateQuoteDetails(consultantId, quoteId, request);
    }

    @PostMapping("/{consultantId}/quotes/{quoteId}/decision")
    public ConsultantQuoteSummary decideQuote(
            @PathVariable UUID consultantId,
            @PathVariable UUID quoteId,
            @Valid @RequestBody ConsultantQuoteDecisionRequest request
    ) {
        return service.decideQuote(consultantId, quoteId, request.decision());
    }

    @DeleteMapping("/{consultantId}/quotes/{quoteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteQuote(@PathVariable UUID consultantId, @PathVariable UUID quoteId) {
        service.deleteQuote(consultantId, quoteId);
    }

    @PostMapping("/inspections/{inspectionId}/completion-message-sent")
    public ConsultantInspectionSummary markCompletionMessageSent(@PathVariable UUID inspectionId) {
        return service.markCompletionMessageSent(inspectionId);
    }
}
