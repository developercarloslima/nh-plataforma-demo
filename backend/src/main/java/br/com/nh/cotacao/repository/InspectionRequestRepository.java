package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.InspectionRequest;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InspectionRequestRepository extends JpaRepository<InspectionRequest, UUID> {
    long countByConsultantId(UUID consultantId);

    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    Optional<InspectionRequest> findByPublicToken(String publicToken);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from InspectionRequest request where request.publicToken = :publicToken")
    Optional<InspectionRequest> findByPublicTokenForUpdate(@Param("publicToken") String publicToken);

    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    Optional<InspectionRequest> findByQuotation_Id(UUID quotationId);

    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    List<InspectionRequest> findTop300ByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    List<InspectionRequest> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    List<InspectionRequest> findAllByConsultant_IdOrderByCreatedAtDesc(UUID consultantId);

    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    List<InspectionRequest> findAllByConsultantNameIgnoreCaseOrderByCreatedAtDesc(String consultantName);

    @Override
    @EntityGraph(attributePaths = {"assets", "consultant", "quotation"})
    Optional<InspectionRequest> findById(UUID id);
}
