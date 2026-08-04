package br.com.nh.cotacao.service;

import br.com.nh.cotacao.entity.Quotation;
import com.google.api.client.http.ByteArrayContent;
import com.google.api.client.http.HttpRequestInitializer;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.DriveScopes;
import com.google.api.services.drive.model.Permission;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.UserCredentials;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class GoogleDriveStorageService {

    private static final String FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

    private final boolean enabled;
    private final String credentialsBase64;
    private final String credentialsJson;
    private final String credentialsPath;
    private final String oauthClientId;
    private final String oauthClientSecret;
    private final String oauthRefreshToken;
    private final String rootFolderId;
    private final boolean publicLinks;
    private final List<String> teamEmails;

    private volatile Drive drive;
    private volatile String automaticallyCreatedRootFolderId;

    public GoogleDriveStorageService(
            @Value("${app.google-drive.enabled:false}") boolean enabled,
            @Value("${app.google-drive.credentials-base64:}") String credentialsBase64,
            @Value("${app.google-drive.credentials-json:}") String credentialsJson,
            @Value("${app.google-drive.credentials-path:}") String credentialsPath,
            @Value("${app.google-drive.oauth-client-id:}") String oauthClientId,
            @Value("${app.google-drive.oauth-client-secret:}") String oauthClientSecret,
            @Value("${app.google-drive.oauth-refresh-token:}") String oauthRefreshToken,
            @Value("${app.google-drive.root-folder-id:}") String rootFolderId,
            @Value("${app.google-drive.public-links:false}") boolean publicLinks,
            @Value("${app.google-drive.team-emails:}") String teamEmails
    ) {
        this.enabled = enabled;
        this.credentialsBase64 = clean(credentialsBase64);
        this.credentialsJson = clean(credentialsJson);
        this.credentialsPath = clean(credentialsPath);
        this.oauthClientId = clean(oauthClientId);
        this.oauthClientSecret = clean(oauthClientSecret);
        this.oauthRefreshToken = clean(oauthRefreshToken);
        this.rootFolderId = clean(rootFolderId);
        this.publicLinks = publicLinks;
        this.teamEmails = Arrays.stream(clean(teamEmails).split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    public boolean isConfigured() {
        return enabled && (oauthConfigured() || (serviceAccountConfigured() && !rootFolderId.isBlank()));
    }

    public DriveFolder createFolder(String requestedName) {
        requireConfigured();
        try {
            String folderName = sanitizeName(requestedName);
            com.google.api.services.drive.model.File metadata = new com.google.api.services.drive.model.File()
                    .setName(folderName)
                    .setMimeType(FOLDER_MIME_TYPE)
                    .setParents(Collections.singletonList(resolveRootFolderId()));

            com.google.api.services.drive.model.File folder = drive().files()
                    .create(metadata)
                    .setSupportsAllDrives(true)
                    .setFields("id,webViewLink")
                    .execute();

            applyFolderPermissions(folder.getId());
            String url = folder.getWebViewLink() == null
                    ? "https://drive.google.com/drive/folders/" + folder.getId()
                    : folder.getWebViewLink();
            return new DriveFolder(folder.getId(), url);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível criar a pasta no Google Drive.", exception);
        }
    }

    public DriveFolder ensureQuotationFolder(Quotation quotation) {
        requireConfigured();
        if (quotation.getDriveFolderId() != null && !quotation.getDriveFolderId().isBlank()) {
            return new DriveFolder(quotation.getDriveFolderId(), quotation.getDriveFolderUrl());
        }
        try {
            String plateLabel = quotation.getPlate() == null || quotation.getPlate().isBlank() ? "0KM-SEM-PLACA" : quotation.getPlate();
            String folderName = sanitizeName(quotation.getCustomerName() + " - " + plateLabel);
            com.google.api.services.drive.model.File metadata = new com.google.api.services.drive.model.File()
                    .setName(folderName)
                    .setMimeType(FOLDER_MIME_TYPE)
                    .setParents(Collections.singletonList(resolveRootFolderId()));

            com.google.api.services.drive.model.File folder = drive().files()
                    .create(metadata)
                    .setSupportsAllDrives(true)
                    .setFields("id,webViewLink")
                    .execute();

            applyFolderPermissions(folder.getId());
            String url = folder.getWebViewLink() == null
                    ? "https://drive.google.com/drive/folders/" + folder.getId()
                    : folder.getWebViewLink();
            return new DriveFolder(folder.getId(), url);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível criar a pasta da vistoria no Google Drive.", exception);
        }
    }

    public DriveFile upload(String folderId, String fileName, String contentType, byte[] bytes) {
        requireConfigured();
        try {
            com.google.api.services.drive.model.File metadata = new com.google.api.services.drive.model.File()
                    .setName(sanitizeName(fileName))
                    .setParents(Collections.singletonList(folderId));
            ByteArrayContent media = new ByteArrayContent(contentType, bytes);
            com.google.api.services.drive.model.File file = drive().files()
                    .create(metadata, media)
                    .setSupportsAllDrives(true)
                    .setFields("id,webViewLink,webContentLink")
                    .execute();
            return toDriveFile(file);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível enviar um arquivo para o Google Drive.", exception);
        }
    }

    public DriveFile uploadOrUpdate(
            String existingFileId,
            String folderId,
            String fileName,
            String contentType,
            byte[] bytes
    ) {
        requireConfigured();
        if (existingFileId == null || existingFileId.isBlank()) {
            return upload(folderId, fileName, contentType, bytes);
        }
        try {
            com.google.api.services.drive.model.File metadata = new com.google.api.services.drive.model.File()
                    .setName(sanitizeName(fileName));
            ByteArrayContent media = new ByteArrayContent(contentType, bytes);
            com.google.api.services.drive.model.File file = drive().files()
                    .update(existingFileId, metadata, media)
                    .setSupportsAllDrives(true)
                    .setFields("id,webViewLink,webContentLink")
                    .execute();
            return toDriveFile(file);
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível atualizar o PDF no Google Drive.", exception);
        }
    }

    public byte[] download(String fileId) {
        requireConfigured();
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            drive().files().get(fileId)
                    .setSupportsAllDrives(true)
                    .executeMediaAndDownloadTo(output);
            return output.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível recuperar uma foto da vistoria no Google Drive.", exception);
        }
    }

    public void deleteQuietly(String fileId) {
        if (fileId == null || fileId.isBlank() || !isConfigured()) {
            return;
        }
        try {
            drive().files().delete(fileId)
                    .setSupportsAllDrives(true)
                    .execute();
        } catch (Exception ignored) {
            // A limpeza de arquivos antigos não deve invalidar uma vistoria concluída.
        }
    }

    private String resolveRootFolderId() {
        if (!rootFolderId.isBlank()) {
            return rootFolderId;
        }
        if (!oauthConfigured()) {
            throw new IllegalStateException("Informe GOOGLE_DRIVE_ROOT_FOLDER_ID para o Drive compartilhado.");
        }

        String current = automaticallyCreatedRootFolderId;
        if (current != null && !current.isBlank()) {
            return current;
        }

        synchronized (this) {
            if (automaticallyCreatedRootFolderId != null && !automaticallyCreatedRootFolderId.isBlank()) {
                return automaticallyCreatedRootFolderId;
            }
            try {
                String query = "mimeType = '" + FOLDER_MIME_TYPE + "' and trashed = false "
                        + "and appProperties has { key='nhCotacaoRoot' and value='true' }";
                List<com.google.api.services.drive.model.File> folders = drive().files().list()
                        .setQ(query)
                        .setSpaces("drive")
                        .setPageSize(1)
                        .setFields("files(id)")
                        .execute()
                        .getFiles();

                if (folders != null && !folders.isEmpty()) {
                    automaticallyCreatedRootFolderId = folders.getFirst().getId();
                    return automaticallyCreatedRootFolderId;
                }

                com.google.api.services.drive.model.File metadata = new com.google.api.services.drive.model.File()
                        .setName("NH - Vistorias")
                        .setMimeType(FOLDER_MIME_TYPE)
                        .setAppProperties(Map.of("nhCotacaoRoot", "true"));
                com.google.api.services.drive.model.File folder = drive().files()
                        .create(metadata)
                        .setFields("id")
                        .execute();
                automaticallyCreatedRootFolderId = folder.getId();
                return automaticallyCreatedRootFolderId;
            } catch (Exception exception) {
                throw new IllegalStateException("Não foi possível localizar ou criar a pasta raiz NH - Vistorias.", exception);
            }
        }
    }

    private Drive drive() {
        Drive current = drive;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (drive == null) {
                drive = buildDrive();
            }
            return drive;
        }
    }

    private Drive buildDrive() {
        try {
            GoogleCredentials credentials;
            if (oauthConfigured()) {
                credentials = UserCredentials.newBuilder()
                        .setClientId(oauthClientId)
                        .setClientSecret(oauthClientSecret)
                        .setRefreshToken(oauthRefreshToken)
                        .build();
            } else {
                try (InputStream credentialsStream = openServiceAccountCredentials()) {
                    credentials = GoogleCredentials.fromStream(credentialsStream)
                            .createScoped(List.of(DriveScopes.DRIVE));
                }
            }

            HttpRequestInitializer initializer = new HttpCredentialsAdapter(credentials);
            return new Drive.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    initializer
            ).setApplicationName("NH Cotação Digital").build();
        } catch (Exception exception) {
            throw new IllegalStateException("Não foi possível autenticar na API do Google Drive.", exception);
        }
    }

    private InputStream openServiceAccountCredentials() throws Exception {
        if (!credentialsBase64.isBlank()) {
            return new ByteArrayInputStream(Base64.getDecoder().decode(credentialsBase64));
        }
        if (!credentialsJson.isBlank()) {
            return new ByteArrayInputStream(credentialsJson.getBytes(StandardCharsets.UTF_8));
        }
        if (!credentialsPath.isBlank()) {
            return new FileInputStream(credentialsPath);
        }
        throw new IllegalStateException("As credenciais do Google Drive não foram configuradas.");
    }

    private void applyFolderPermissions(String folderId) throws Exception {
        if (publicLinks) {
            Permission permission = new Permission().setType("anyone").setRole("reader");
            drive().permissions().create(folderId, permission)
                    .setSupportsAllDrives(true)
                    .setFields("id")
                    .execute();
        }
        for (String email : teamEmails) {
            Permission permission = new Permission()
                    .setType("user")
                    .setRole("reader")
                    .setEmailAddress(email);
            drive().permissions().create(folderId, permission)
                    .setSupportsAllDrives(true)
                    .setSendNotificationEmail(false)
                    .setFields("id")
                    .execute();
        }
    }

    private DriveFile toDriveFile(com.google.api.services.drive.model.File file) {
        String viewUrl = file.getWebViewLink() == null
                ? "https://drive.google.com/file/d/" + file.getId() + "/view"
                : file.getWebViewLink();
        return new DriveFile(file.getId(), viewUrl, file.getWebContentLink());
    }

    private String sanitizeName(String value) {
        String normalized = value == null ? "arquivo" : value
                .replaceAll("[\\\\/:*?\"<>|]", "-")
                .replaceAll("\\s+", " ")
                .trim();
        if (normalized.isBlank()) {
            normalized = "arquivo";
        }
        return normalized.length() > 160 ? normalized.substring(0, 160) : normalized;
    }

    private boolean oauthConfigured() {
        return !oauthClientId.isBlank() && !oauthClientSecret.isBlank() && !oauthRefreshToken.isBlank();
    }

    private boolean serviceAccountConfigured() {
        return !credentialsBase64.isBlank() || !credentialsJson.isBlank() || !credentialsPath.isBlank();
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "O Google Drive ainda não foi configurado. Defina OAuth ou uma conta de serviço com pasta em Drive compartilhado."
            );
        }
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    public record DriveFolder(String id, String url) {
    }

    public record DriveFile(String id, String viewUrl, String downloadUrl) {
    }
}
