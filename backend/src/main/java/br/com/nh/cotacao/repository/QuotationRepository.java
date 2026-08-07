package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.Quotation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuotationRepository extends JpaRepository<Quotation, UUID> {
    long countBy();
    long countByConsultantId(UUID consultantId);
    long countByCreatedAtBefore(OffsetDateTime cutoff);

    @EntityGraph(attributePaths = {"selectedOptionals", "inspectionPhotos", "consultant"})
    List<Quotation> findTop300ByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"selectedOptionals", "inspectionPhotos", "consultant"})
    List<Quotation> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"selectedOptionals", "inspectionPhotos", "consultant"})
    List<Quotation> findAllByConsultant_IdOrderByCreatedAtDesc(UUID consultantId);

    @EntityGraph(attributePaths = {"selectedOptionals", "inspectionPhotos", "consultant"})
    List<Quotation> findAllByConsultantNameIgnoreCaseOrderByCreatedAtDesc(String consultantName);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Quotation q where q.createdAt < :cutoff")
    int deleteCreatedBefore(@Param("cutoff") OffsetDateTime cutoff);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Quotation q")
    int deleteAllQuotations();

    @Override
    @EntityGraph(attributePaths = {"selectedOptionals", "coverageSnapshots", "inspectionPhotos", "consultant"})
    Optional<Quotation> findById(UUID id);
}
