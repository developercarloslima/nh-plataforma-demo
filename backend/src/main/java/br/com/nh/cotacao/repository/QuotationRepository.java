package br.com.nh.cotacao.repository;

import br.com.nh.cotacao.entity.Quotation;
import br.com.nh.cotacao.entity.QuoteStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuotationRepository extends JpaRepository<Quotation, UUID> {
    long countBy();
    long countByConsultantId(UUID consultantId);

    @EntityGraph(attributePaths = {"selectedOptionals", "inspectionPhotos", "consultant"})
    List<Quotation> findTop300ByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"selectedOptionals", "inspectionPhotos", "consultant"})
    List<Quotation> findAllByOrderByCreatedAtDesc();

    @Override
    @EntityGraph(attributePaths = {"selectedOptionals", "coverageSnapshots", "inspectionPhotos", "consultant"})
    Optional<Quotation> findById(UUID id);
}
