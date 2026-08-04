package br.com.nh.cotacao.entity;

import jakarta.persistence.*;

import java.util.UUID;

@Entity
@Table(name = "inspection_assets")
public class InspectionAsset {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inspection_id", nullable = false)
    private InspectionRequest inspectionRequest;

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_type", nullable = false, length = 20)
    private InspectionAssetType assetType;

    @Column(nullable = false, length = 140)
    private String label;

    @Column(name = "file_name", nullable = false, length = 220)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "drive_file_id", nullable = false, length = 160)
    private String driveFileId;

    @Column(name = "drive_file_url", length = 500)
    private String driveFileUrl;

    protected InspectionAsset() {}

    public static InspectionAsset create(
            InspectionRequest request,
            InspectionAssetType type,
            String label,
            String fileName,
            String contentType,
            long fileSize,
            int sortOrder,
            String driveFileId,
            String driveFileUrl
    ) {
        InspectionAsset asset = new InspectionAsset();
        asset.id = UUID.randomUUID();
        asset.inspectionRequest = request;
        asset.assetType = type;
        asset.label = label;
        asset.fileName = fileName;
        asset.contentType = contentType;
        asset.fileSize = fileSize;
        asset.sortOrder = sortOrder;
        asset.driveFileId = driveFileId;
        asset.driveFileUrl = driveFileUrl;
        return asset;
    }

    public UUID getId() { return id; }
    public InspectionAssetType getAssetType() { return assetType; }
    public String getLabel() { return label; }
    public String getFileName() { return fileName; }
    public String getContentType() { return contentType; }
    public long getFileSize() { return fileSize; }
    public int getSortOrder() { return sortOrder; }
    public String getDriveFileId() { return driveFileId; }
    public String getDriveFileUrl() { return driveFileUrl; }
}
