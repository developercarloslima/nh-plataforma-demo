package br.com.nh.cotacao.config;

import br.com.nh.cotacao.service.PortalUserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class PortalUserBootstrapConfig implements ApplicationRunner {
    private final PortalUserService service;
    private final String consultantUsername;
    private final String consultantPassword;
    private final String analystUsername;
    private final String analystPassword;
    private final String adminUsername;
    private final String adminPassword;

    public PortalUserBootstrapConfig(
            PortalUserService service,
            @Value("${app.auth.consultant-username}") String consultantUsername,
            @Value("${app.auth.consultant-password}") String consultantPassword,
            @Value("${app.auth.analyst-username}") String analystUsername,
            @Value("${app.auth.analyst-password}") String analystPassword,
            @Value("${app.auth.admin-username}") String adminUsername,
            @Value("${app.auth.admin-password}") String adminPassword
    ) {
        this.service = service;
        this.consultantUsername = consultantUsername;
        this.consultantPassword = consultantPassword;
        this.analystUsername = analystUsername;
        this.analystPassword = analystPassword;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        // Mantém os logins atuais do .env na primeira execução da V28, sem sobrescrever
        // senhas que forem alteradas posteriormente pelo painel administrativo.
        service.bootstrapDefaults(
                adminUsername, adminPassword,
                analystUsername, analystPassword,
                consultantUsername, consultantPassword
        );
    }
}
