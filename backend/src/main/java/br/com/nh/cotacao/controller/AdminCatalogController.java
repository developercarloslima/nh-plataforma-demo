package br.com.nh.cotacao.controller;

import br.com.nh.cotacao.dto.AdminDtos.*;
import br.com.nh.cotacao.security.PortalPrincipal;
import br.com.nh.cotacao.service.AdminCatalogService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/catalog")
public class AdminCatalogController {
    private final AdminCatalogService service;

    public AdminCatalogController(AdminCatalogService service) { this.service = service; }

    @GetMapping("/prices")
    public List<PriceRangeResponse> prices() { return service.priceRanges(); }

    @PatchMapping("/prices/{id}")
    public PriceRangeResponse updatePrice(@PathVariable Long id, @Valid @RequestBody UpdatePriceRequest request, Authentication auth) {
        return service.updatePriceRange(id, request.monthlyPrice(), ((PortalPrincipal) auth.getPrincipal()).username());
    }

    @GetMapping("/optionals")
    public List<OptionalPriceResponse> optionals() { return service.optionals(); }

    @PatchMapping("/optionals/{id}")
    public OptionalPriceResponse updateOptional(@PathVariable Long id, @Valid @RequestBody UpdatePriceRequest request, Authentication auth) {
        return service.updateOptional(id, request.monthlyPrice(), ((PortalPrincipal) auth.getPrincipal()).username());
    }

    @GetMapping("/audit")
    public List<AuditResponse> audit() { return service.audit(); }
}
