package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.InspectionRequest;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InspectionRequestRepository extends JpaRepository<InspectionRequest, UUID> {
    long countByConsultantId(UUID consultantId);

    @EntityGraph(attributePaths = {"assets", "consultant"})
    Optional<InspectionRequest> findByPublicToken(String publicToken);

    @EntityGraph(attributePaths = {"assets", "consultant"})
    List<InspectionRequest> findTop300ByOrderByCreatedAtDesc();
}
