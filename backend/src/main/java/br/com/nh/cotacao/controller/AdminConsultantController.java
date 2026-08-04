package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.PortalDtos.*;
import br.com.nh.cotacao.service.ConsultantService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/consultants")
public class AdminConsultantController {
    private final ConsultantService service;

    public AdminConsultantController(ConsultantService service) {
        this.service = service;
    }

    @GetMapping
    public List<ConsultantResponse> all() { return service.all(); }

    @PatchMapping("/{id}")
    public ConsultantResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateConsultantRequest request) {
        return service.update(id, request.name(), request.active());
    }
}
