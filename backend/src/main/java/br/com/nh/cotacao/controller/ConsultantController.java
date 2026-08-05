package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.PortalDtos.*;
import br.com.nh.cotacao.service.ConsultantService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/consultants")
public class ConsultantController {
    private final ConsultantService service;

    public ConsultantController(ConsultantService service) {
        this.service = service;
    }

    @GetMapping
    public List<ConsultantResponse> active() {
        return service.active();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConsultantResponse create(@Valid @RequestBody CreateConsultantRequest request) {
        return service.create(request.name(), "CREATED_IN_PORTAL");
    }

    @PostMapping("/{id}/portal-login")
    public ConsultantResponse registerPortalLogin(@PathVariable UUID id) {
        return service.registerPortalLogin(id);
    }
}
