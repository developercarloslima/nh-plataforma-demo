# NH Plataforma — Novo Horizonte Proteção Veicular

<p align="center">
  <img src="web/assets/logo-nh-oficial.png" alt="Novo Horizonte Proteção Veicular" width="280" />
</p>

<p align="center">
  Plataforma web integrada para operação comercial, cotação, vistoria, eventos, checklist veicular, reboque, oficina, compras, análise, supervisão e administração da Novo Horizonte Proteção Veicular.
</p>

<p align="center">
  <strong>Versão documentada:</strong> V78 &nbsp;•&nbsp;
  <strong>Data:</strong> 23/09/2026 &nbsp;•&nbsp;
  <strong>Desenvolvimento:</strong> Carlos Lima
</p>

---

## Sumário

- [1. Visão geral](#1-visão-geral)
- [2. Objetivos da plataforma](#2-objetivos-da-plataforma)
- [3. Arquitetura](#3-arquitetura)
- [4. Stack tecnológica](#4-stack-tecnológica)
- [5. Perfis de acesso e responsabilidades](#5-perfis-de-acesso-e-responsabilidades)
- [6. Módulos e funcionalidades](#6-módulos-e-funcionalidades)
- [7. Fluxos operacionais](#7-fluxos-operacionais)
- [8. NH Checklist — Eventos, Guincho, Oficina e Financeiro](#8-nh-checklist--eventos-guincho-oficina-e-financeiro)
- [9. Segurança e autorização](#9-segurança-e-autorização)
- [10. Banco de dados e migrations](#10-banco-de-dados-e-migrations)
- [11. Integrações externas](#11-integrações-externas)
- [12. Estrutura do projeto](#12-estrutura-do-projeto)
- [13. Variáveis de ambiente](#13-variáveis-de-ambiente)
- [14. Execução local](#14-execução-local)
- [15. Deploy em VPS / KingHost](#15-deploy-em-vps--kinghost)
- [16. Backup e restauração](#16-backup-e-restauração)
- [17. Health checks e observabilidade](#17-health-checks-e-observabilidade)
- [18. API — visão geral dos endpoints](#18-api--visão-geral-dos-endpoints)
- [19. Retenção e limpeza de dados](#19-retenção-e-limpeza-de-dados)
- [20. Responsividade e experiência de uso](#20-responsividade-e-experiência-de-uso)
- [21. Histórico recente de versões](#21-histórico-recente-de-versões)
- [22. Boas práticas de operação](#22-boas-práticas-de-operação)
- [23. Solução de problemas](#23-solução-de-problemas)
- [24. Segurança operacional](#24-segurança-operacional)
- [25. Créditos](#25-créditos)

---

## 1. Visão geral

A **NH Plataforma** centraliza processos públicos e internos da **Novo Horizonte Proteção Veicular** em uma única solução. O projeto combina um site institucional com uma aplicação operacional composta por múltiplos portais, API REST, banco PostgreSQL e integrações externas.

A versão V78 documentada neste repositório contempla, entre outros recursos:

- site institucional e captação de cotações;
- consulta de segunda via de boleto integrada à Hinova;
- fluxo de cotação e aceite;
- vistoria digital e registro de evidências;
- gestão de usuários e perfis internos;
- área do colaborador/consultor;
- análise e supervisão;
- eventos veiculares;
- checklist independente do guincho/reboque;
- checklist técnico completo da oficina por categoria de veículo;
- inclusão manual de peças não cadastradas no evento;
- fotos por item de checklist;
- compras vinculadas ao evento;
- painel financeiro exclusivo para compras;
- dossiês em PDF;
- aceite digital;
- painel administrativo com consulta operacional;
- exclusão administrativa de Eventos;
- rodapé padronizado com crédito de desenvolvimento;
- responsividade ampla para desktop, tablet e celular.

> **Importante:** o projeto contém dados operacionais e pode processar documentos, fotos, vídeos e informações de associados. Produção deve utilizar credenciais próprias, HTTPS, backups e controle de acesso adequado.

---

## 2. Objetivos da plataforma

A plataforma foi estruturada para reduzir dispersão de informações entre equipes e separar claramente as responsabilidades operacionais.

Os principais objetivos são:

1. centralizar o ciclo de atendimento em uma única base;
2. manter rastreabilidade de alterações, documentos e decisões;
3. separar permissões por função;
4. automatizar a passagem de trabalho entre áreas;
5. gerar dossiês consistentes a partir dos dados registrados;
6. preservar histórico por meio de migrations versionadas;
7. permitir uso em desktop e dispositivos móveis;
8. proteger o banco durante atualizações de aplicação;
9. integrar serviços externos sem expor credenciais no frontend.

---

## 3. Arquitetura

A aplicação de produção é executada em containers Docker separados.

```text
                         Internet
                            │
                            ▼
                    ┌────────────────┐
                    │     Caddy      │
                    │ HTTPS / Proxy  │
                    └───────┬────────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
        ┌────────────────┐    ┌────────────────────┐
        │      Web       │    │  Backend Spring   │
        │ Nginx + HTML   │    │ Boot / REST API   │
        │ CSS + JS       │    │     Java 21       │
        └───────┬────────┘    └─────────┬──────────┘
                │                       │
                │                       ▼
                │              ┌──────────────────┐
                │              │ PostgreSQL 16    │
                │              │ volume persist.  │
                │              └──────────────────┘
                │
                └──────────────┐
                               ▼
                      ┌─────────────────┐
                      │   Hinova API    │
                      │ Node.js proxy   │
                      └─────────────────┘
```

### Serviços Docker em produção

| Serviço | Responsabilidade | Porta interna |
| --- | --- | ---: |
| `database` | PostgreSQL persistente | `5432` |
| `backend` | API Spring Boot e regras de negócio | `8080` |
| `hinova-api` | Proxy Node.js para integração Hinova | `3001` |
| `web` | Frontend estático servido pelo Nginx | `80` |
| `caddy` | Reverse proxy, HTTPS e exposição pública | `80/443` |

Os serviços de aplicação compartilham uma rede Docker interna. Em produção, somente o Caddy publica as portas HTTP/HTTPS para o host.

---

## 4. Stack tecnológica

### Backend

- **Java 21**
- **Spring Boot 3.4.5**
- Spring Web
- Spring Data JPA
- Spring Validation
- Spring Security
- Flyway
- PostgreSQL Driver
- OpenPDF `2.2.3`
- Apache PDFBox `3.0.3`
- Google Drive API
- Google Auth Library
- Maven `3.9.9` no estágio de build
- FFmpeg / FFprobe no container de runtime

### Banco de dados

- **PostgreSQL 16 Alpine**
- migrations versionadas com **Flyway**
- volume Docker persistente `nh_postgres_data`

### Frontend

- HTML5
- CSS3
- JavaScript Vanilla
- Nginx `1.27-alpine`
- camada responsiva compartilhada
- módulos JavaScript compartilhados para navegação, configuração, utilidades e rodapé

### Integrações / serviços auxiliares

- Node.js `22-alpine` no container `hinova-api`
- Express `4.21.2`
- Hinova SGA V2
- WhatsApp Business Cloud API, quando habilitada
- Google Drive, quando habilitado
- Caddy 2 para HTTPS/reverse proxy

---

## 5. Perfis de acesso e responsabilidades

O backend possui oito perfis de portal:

| Perfil | Responsabilidade principal | Área principal |
| --- | --- | --- |
| `CONSULTANT` | Operação comercial/consultor | `/colaborador/` |
| `ANALYST` | Análise de vistorias e cadastros | `/analise/` |
| `SUPERVISION_ANALYSIS` | Supervisão e validações | `/supervisao/` |
| `WORKSHOP_MANAGER` | Checklist técnico da oficina | `/oficina/` |
| `TOW_DRIVER` | Checklist independente de reboque | `/guincho/` |
| `EVENT_OPERATOR` | Cadastro e edição de Eventos | `/checklist/` |
| `BUYER` | Compras/Financeiro | `/financeiro/` |
| `ADMIN` | Administração e visão ampliada | `/admin/` |

### Princípio de menor privilégio

A separação de funções é aplicada no backend, e não apenas escondendo elementos no frontend. Exemplos:

- alterações administrativas em `/api/admin/**` exigem `ADMIN`;
- atualização de compras exige `BUYER`;
- área da oficina aceita `WORKSHOP_MANAGER`, `SUPERVISION_ANALYSIS` ou `ADMIN`;
- Eventos aceita os perfis operacionais previstos para consulta, mas a exclusão é protegida para `ADMIN`;
- o perfil `TOW_DRIVER` permanece isolado do restante das APIs internas.

---

## 6. Módulos e funcionalidades

### 6.1 Site institucional

O site público apresenta a marca Novo Horizonte, benefícios, informações de atendimento, escritórios, aplicativo, contatos e chamadas para cotação.

Principais páginas públicas:

- `/`
- `/escritorios.html`
- `/boleto.html`
- `/cota/`
- `/comparacao/`
- páginas públicas de confirmação e aceite geradas pelos fluxos internos.

### 6.2 Cotação

O módulo de cotação permite criar propostas, calcular opções de plano, registrar decisão e gerar PDF.

O catálogo comercial possui:

- categorias de veículos;
- faixas de preço;
- planos;
- coberturas;
- opcionais;
- preços promocionais de motocicletas;
- regras comerciais e histórico de alterações.

### 6.3 Área do Colaborador / Consultor

Responsável pelo trabalho comercial e acompanhamento de suas cotações e vistorias.

A plataforma mantém associação entre usuários de portal e consultores, além de painel próprio com dados operacionais.

### 6.4 Vistoria / Retrato NH

O fluxo de vistoria permite registrar arquivos e evidências, processar vídeos, gerar dossiês e realizar aceite digital quando aplicável.

O backend inclui suporte a:

- upload convencional;
- upload em partes/chunks;
- retomada de upload;
- armazenamento em PostgreSQL;
- armazenamento externo opcional em Google Drive;
- validação de mídia;
- PDF final;
- aceite digital;
- revalidação contratual após alteração de valores.

### 6.5 Análise

O perfil `ANALYST` possui fila própria e pode trabalhar nas etapas previstas de análise, registro e decisão.

### 6.6 Supervisão

O perfil `SUPERVISION_ANALYSIS` recebe uma fila própria de supervisão e possui ações específicas para revisão e decisão.

### 6.7 Administração

O painel administrativo centraliza:

- usuários;
- consultores;
- cotações;
- vistorias;
- catálogo comercial;
- configurações;
- documentação pública;
- Eventos;
- Oficina;
- Guincho/Reboque;
- arquivos e evidências;
- auditoria;
- exclusões permitidas ao administrador.

Listagens grandes usam carregamento visual progressivo para reduzir excesso de informação na tela.

---

## 7. Fluxos operacionais

### Fluxo comercial simplificado

```text
Cotação
  ↓
Seleção de plano / opcionais
  ↓
Decisão do cliente
  ↓
Vistoria, quando aplicável
  ↓
Análise
  ↓
Supervisão, quando aplicável
  ↓
Aceite / conclusão
  ↓
Dossiê / histórico
```

### Fluxo de Evento veicular

```text
EVENT_OPERATOR registra Evento
  ↓
Dados do associado + veículo + terceiros + fotos/documentos
  ↓
Evento enviado à Oficina
  ↓
WORKSHOP_MANAGER avalia checklist técnico
  ↓
Cada item com avaria recebe ação:
Recuperar/Reparar ou Trocar
  ↓
Oficina finaliza checklist
  ↓
Itens marcados como Trocar → Financeiro
  ↓
BUYER registra fornecedor, valor e prazo
  ↓
Compras: Solicitado → Finalizado
  ↓
Dossiê consolidado do Evento
```

### Fluxo independente de Guincho/Reboque

```text
TOW_DRIVER abre atendimento pela placa
  ↓
Checklist de acessórios/pertences
  ↓
Fotos obrigatórias do veículo
  ↓
Conclusão do atendimento
  ↓
Registro permanece pesquisável pela placa
  ↓
Pode ser associado automaticamente a um Evento
```

---

## 8. NH Checklist — Eventos, Guincho, Oficina e Financeiro

### 8.1 Eventos — `/checklist/`

A Área de Eventos é operada principalmente por `EVENT_OPERATOR`.

No cadastro podem ser registrados:

- tipo de evento;
- dados do associado;
- dados do veículo;
- categoria do veículo;
- informações comerciais/técnicas disponíveis;
- terceiros envolvidos;
- fotos do evento e do veículo;
- boletim de ocorrência;
- comprovante de participação;
- vistoria anterior;
- demais anexos previstos pelo fluxo.

A categoria do veículo é importante porque direciona o checklist técnico apresentado à Oficina.

#### Exclusão administrativa — V78

O endpoint:

```http
DELETE /api/checklist/events/{id}
```

é restrito ao perfil `ADMIN`.

A interface exibe a ação de exclusão somente para administrador, com confirmação explícita de ação irreversível. A exclusão utiliza os relacionamentos configurados no banco para remover os dados dependentes vinculados ao Evento.

### 8.2 Guincho / Reboque — `/guincho/`

O checklist do reboque é independente de Evento.

O prestador pode informar:

- placa;
- modelo;
- categoria;
- prestador;
- motorista;
- telefone;
- observações.

Itens do checklist aceitam:

- `Sim`;
- `Não`;
- `Não se aplica`;
- observação;
- foto por item quando aplicável.

Fotos gerais esperadas:

- frente;
- lateral esquerda;
- lateral direita;
- traseira;
- fotos extras/detalhes.

### 8.3 Oficina — `/oficina/`

A Oficina recebe os Eventos enviados para avaliação técnica.

Para cada componente:

1. informa se existe avaria;
2. se houver avaria, escolhe `Recuperar/Reparar` ou `Trocar`;
3. pode incluir observação;
4. pode anexar evidência fotográfica por item.

O checklist é segmentado pela categoria do veículo e contém centenas de itens técnicos dependendo do tipo de veículo.

Categorias contempladas no catálogo técnico incluem:

- motocicleta;
- carro leve/passeio;
- utilitário/pickup/van;
- caminhão/veículo pesado.

A Oficina também possui busca de peça por nome. A pesquisa ignora acentos e diferença entre maiúsculas/minúsculas. Caso a peça não exista, pode ser criada na seção **Diversos** somente para aquele evento, sem alterar o checklist padrão dos eventos futuros.

Depois da finalização:

- o checklist técnico fica bloqueado para alterações operacionais indevidas;
- itens marcados como `Trocar` são encaminhados ao fluxo de compras;
- o dossiê passa a refletir a conclusão da Oficina.

### 8.4 Financeiro / Compras — `/financeiro/`

O perfil `BUYER` é responsável pelo preenchimento de compras.

Cada compra pode conter:

- item solicitado;
- fornecedor;
- valor;
- prazo/data de entrega;
- status;
- observação.

Filas do painel:

- **Não preenchido**;
- **Solicitado**;
- **Finalizado**.

A Oficina não preenche mais os dados financeiros de compra. Ela somente define tecnicamente quais itens devem ser trocados.

### 8.5 Dossiê do Evento

O dossiê pode consolidar:

- dados do Evento;
- associado;
- veículo;
- terceiros;
- anexos originais;
- checklist técnico;
- evidências da Oficina;
- compras;
- dados e fotos do reboque, quando vinculados;
- aceite digital quando aplicável;
- histórico necessário ao processo.

---

## 9. Segurança e autorização

### Autenticação

A API utiliza autenticação por token Bearer e opera com sessões stateless no Spring Security.

Rotas públicas incluem somente os recursos explicitamente liberados, como:

- `/api/health`;
- `/api/auth/login`;
- `/api/public/**`;
- download público de determinados PDFs com regras próprias.

### Despachos assíncronos

A V78 mantém a correção de segurança para:

```java
DispatcherType.ASYNC
DispatcherType.ERROR
```

Esses despachos internos são permitidos para evitar nova autorização indevida durante respostas assíncronas/streaming, como downloads de arquivos e mídias já autorizados na requisição original.

### CSRF e CORS

- CSRF está desabilitado porque a API utiliza autenticação stateless por token.
- CORS é configurado pela aplicação e pelos domínios permitidos do ambiente.

### Credenciais

Nunca armazene senhas ou tokens reais no Git.

Em produção:

- altere todas as credenciais padrão;
- gere uma chave `AUTH_TOKEN_SECRET` longa e aleatória;
- proteja o `.env` com permissões de sistema operacional;
- evite compartilhar cópias de `.env` em mensageiros ou repositórios;
- faça rotação imediata de qualquer segredo exposto.

---

## 10. Banco de dados e migrations

A aplicação usa **Flyway** para controlar a evolução do schema.

As migrations ficam em:

```text
backend/src/main/resources/db/migration/
```

Na V78, o projeto contém migrations de `V1` até `V67`.

### Migrations recentes relacionadas ao NH Checklist

| Migration | Resumo |
| --- | --- |
| `V58` | Estrutura inicial do NH Checklist e reboque |
| `V59` | Portal do motorista/guincho |
| `V60` | Separação Evento, reboque, Oficina e compras |
| `V61` | Contexto de anexos da Oficina |
| `V62` | Checklist padrão e fotos por item no reboque |
| `V63` | Regras de contas genéricas sem troca obrigatória |
| `V64` | Perfil completo do veículo e checklists por categoria |
| `V65` | Fotos por item da Oficina |
| `V66` | Dossiê interno, bloqueios e aceite digital |
| `V67` | Perfis Eventos/Comprador e fluxo final de compras |

A V78 **não adiciona migration nova**.

### Regra crítica

Para preservar o banco de dados existente, **não execute**:

```bash
docker compose down -v
```

O parâmetro `-v` remove volumes e pode eliminar o volume persistente do PostgreSQL.

---

## 11. Integrações externas

### 11.1 Hinova SGA V2

A integração de boletos usa um serviço Node.js separado, evitando exposição direta das credenciais no navegador.

Fluxo simplificado:

```text
Frontend
  ↓
API interna / proxy Hinova
  ↓
Hinova SGA V2
  ↓
Normalização e aplicação das regras
  ↓
Resposta ao frontend
```

O módulo aplica regras por veículo/placa para determinar quais boletos podem ser apresentados ao associado.

### 11.2 WhatsApp Business Cloud API

A integração é opcional e pode ser habilitada por variáveis de ambiente para comunicações automatizadas previstas pela plataforma.

### 11.3 Google Drive

O backend possui suporte opcional a Google Drive para armazenamento de evidências, dependendo das credenciais e flags configuradas no ambiente.

### 11.4 PDF

A aplicação gera documentos utilizando OpenPDF e PDFBox, incluindo dossiês e documentos operacionais.

---

## 12. Estrutura do projeto

```text
.
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── pom.xml
│   └── src/main/
│       ├── java/br/com/nh/cotacao/
│       │   ├── config/
│       │   ├── controller/
│       │   ├── dto/
│       │   ├── entity/
│       │   ├── repository/
│       │   ├── security/
│       │   └── service/
│       └── resources/
│           ├── application-prod.yml
│           └── db/migration/
│
├── hinova-api/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── consultar-boletos-associado.js
│   └── baixar-boleto.js
│
├── web/
│   ├── admin/
│   ├── analise/
│   ├── aceite-evento/
│   ├── checklist/
│   ├── colaborador/
│   ├── comparacao/
│   ├── confirmacao-valor/
│   ├── cota/
│   ├── financeiro/
│   ├── guincho/
│   ├── oficina/
│   ├── retrato/
│   ├── supervisao/
│   ├── shared/
│   │   ├── brand-system.css
│   │   ├── config.js
│   │   ├── developer-footer.js
│   │   ├── money-input.js
│   │   ├── portal-nav.js
│   │   ├── portal.css
│   │   ├── responsive.css
│   │   ├── responsive.js
│   │   └── url-tools.js
│   ├── assets/
│   ├── index.html
│   ├── boleto.html
│   └── escritorios.html
│
├── deploy/
│   └── kinghost/
│       └── Caddyfile
│
├── docker-compose.yml
├── docker-compose.kinghost.yml
├── .env.kinghost.example
├── .env.render.example
├── render.yaml
├── NH-CHECKLIST-INTEGRACAO.md
├── ATUALIZACAO_V*.md
└── README.md
```

---

## 13. Variáveis de ambiente

Use os arquivos de exemplo como referência e crie seu próprio `.env`.

### Infraestrutura

| Variável | Finalidade |
| --- | --- |
| `DOMAIN` | Domínio principal de produção |
| `WWW_DOMAIN` | Domínio com `www` |
| `LETSENCRYPT_EMAIL` | E-mail usado pelo Caddy/Let's Encrypt |
| `POSTGRES_DB` | Nome do banco |
| `POSTGRES_USER` | Usuário do PostgreSQL |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL |

### Autenticação

| Variável | Finalidade |
| --- | --- |
| `AUTH_TOKEN_SECRET` | Chave de assinatura dos tokens |
| `AUTH_TOKEN_HOURS` | Tempo de validade do token |
| `CONSULTANT_USERNAME` | Usuário operacional de consultor |
| `CONSULTANT_PASSWORD` | Senha de consultor |
| `ANALYST_USERNAME` | Usuário operacional de analista |
| `ANALYST_PASSWORD` | Senha de analista |
| `ADMIN_USERNAME` | Usuário administrativo |
| `ADMIN_PASSWORD` | Senha administrativa |
| `TOW_USERNAME` | Usuário de reboque |
| `TOW_PASSWORD` | Senha de reboque |
| `WORKSHOP_USERNAME` | Usuário da Oficina |
| `WORKSHOP_PASSWORD` | Senha da Oficina |
| `EVENT_USERNAME` | Usuário da Área de Eventos |
| `EVENT_PASSWORD` | Senha da Área de Eventos |
| `BUYER_USERNAME` | Usuário Financeiro/Comprador |
| `BUYER_PASSWORD` | Senha Financeiro/Comprador |
| `ADMIN_BULK_DELETE_PASSWORD` | Confirmação adicional para ações administrativas específicas |

### Comunicação

| Variável | Finalidade |
| --- | --- |
| `TEAM_WHATSAPP_NUMBER` | Número operacional da equipe |
| `TEAM_EMAIL` | E-mail operacional |
| `WHATSAPP_CLOUD_ENABLED` | Habilita integração automática |
| `WHATSAPP_CLOUD_API_VERSION` | Versão da API Meta |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | ID do telefone |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Token da integração |
| `WHATSAPP_COMPLETION_TEMPLATE_NAME` | Template de mensagem |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Idioma do template |

### Hinova

| Variável | Finalidade |
| --- | --- |
| `HINOVA_API_BASE_URL` | URL base da API Hinova |
| `HINOVA_API_TOKEN` | Token da integração |
| `HINOVA_API_USER` | Usuário da integração |
| `HINOVA_API_PASSWORD` | Senha da integração |
| `HINOVA_API_USER_TOKEN` | Token autenticado do usuário |
| `HINOVA_ASSOCIADO_CPF_PATH` | Rota complementar por CPF |
| `HINOVA_ASSOCIADO_DEFAULT_PASSWORD` | Senha complementar, se exigida |
| `BOLETO_MAX_DAYS_AFTER_DUE` | Regra de atraso para emissão |
| `BOLETO_SEARCH_DAYS_PAST` | Janela de busca para trás |
| `BOLETO_SEARCH_DAYS_FUTURE` | Janela de busca para frente |
| `BOLETO_SEARCH_CHUNK_DAYS` | Tamanho de cada bloco de consulta |
| `HINOVA_DEBUG_RESPONSE` | Diagnóstico detalhado em ambiente controlado |

### Retenção

| Variável | Finalidade |
| --- | --- |
| `INSPECTION_RETENTION_DAYS` | Retenção dos arquivos de vistoria |
| `INSPECTION_CLEANUP_CRON` | Cron de limpeza de arquivos |
| `OPERATIONAL_RETENTION_DAYS` | Retenção de dados operacionais configurados |
| `OPERATIONAL_RETENTION_CLEANUP_CRON` | Cron de limpeza operacional |

### Google Drive — quando utilizado

| Variável | Finalidade |
| --- | --- |
| `GOOGLE_DRIVE_ENABLED` | Habilita armazenamento no Drive |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Pasta raiz |
| `GOOGLE_DRIVE_OAUTH_CLIENT_ID` | Client ID OAuth |
| `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET` | Client Secret OAuth |
| `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | Refresh token |
| `GOOGLE_DRIVE_CREDENTIALS_BASE64` | Credenciais codificadas, quando adotado esse modo |
| `GOOGLE_DRIVE_PUBLIC_LINKS` | Controle de links públicos |
| `GOOGLE_DRIVE_TEAM_EMAILS` | Compartilhamento com e-mails da equipe |

> O repositório deve conter apenas exemplos. Nunca versionar o `.env` real.

---

## 14. Execução local

### Pré-requisitos

- Docker Engine / Docker Desktop
- Docker Compose V2
- portas locais disponíveis para o ambiente

### 1. Preparar variáveis

Crie um arquivo `.env` na raiz.

Para desenvolvimento, utilize valores locais seguros e diferentes dos de produção.

### 2. Subir o ambiente

```bash
docker compose up -d --build
```

### 3. Conferir os containers

```bash
docker compose ps
```

### 4. Abrir a aplicação

Por padrão, o compose local publica o frontend em:

```text
http://localhost:3000
```

### 5. Acompanhar logs

```bash
docker compose logs -f backend
```

ou:

```bash
docker compose logs -f web
```

### 6. Encerrar sem apagar dados

```bash
docker compose down
```

Não use `-v` se quiser manter o banco local.

---

## 15. Deploy em VPS / KingHost

A instalação de produção utilizada por este projeto pode operar em:

```text
/opt/nh-plataforma/nh-plataforma-demo-main
```

com o arquivo:

```text
docker-compose.kinghost.yml
```

### Processo recomendado de atualização

1. enviar o ZIP para `/root`;
2. validar o ZIP com `unzip -t`;
3. criar backup do PostgreSQL;
4. criar backup do código atual;
5. extrair a nova versão em pasta temporária;
6. conferir `backend`, `web` e compose;
7. comparar o compose novo com o atual;
8. sincronizar os arquivos;
9. compilar `backend` e `web`;
10. recriar somente os serviços necessários;
11. conferir `docker compose ps`;
12. conferir Flyway;
13. verificar logs;
14. executar testes funcionais rápidos no navegador.

### Build

```bash
cd /opt/nh-plataforma/nh-plataforma-demo-main

docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  build backend web
```

### Recriar somente aplicação

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  up -d --no-deps --force-recreate backend web
```

Esse procedimento preserva os demais containers quando não há necessidade de recriá-los.

### Verificar status

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  ps
```

### Regras importantes de deploy

- preservar o `.env` real da produção;
- fazer backup antes de qualquer atualização;
- nunca remover o volume do PostgreSQL durante deploy normal;
- conferir migrations antes e depois do deploy;
- manter Caddy e serviços auxiliares intactos quando a atualização não os altera;
- validar o site com cache renovado (`Ctrl+F5`) depois da publicação.

---

## 16. Backup e restauração

### Backup do PostgreSQL

Exemplo para ambiente de produção:

```bash
cd /opt/nh-plataforma/nh-plataforma-demo-main
mkdir -p backups

BACKUP="backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz"

docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  exec -T database sh -lc \
  'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$BACKUP"

gzip -t "$BACKUP"
ls -lh "$BACKUP"
```

### Backup do código

```bash
CODE_BACKUP="/opt/nh-plataforma/nh-codigo-$(date +%Y%m%d-%H%M%S).tar.gz"

tar -czf "$CODE_BACKUP" \
  backend \
  web \
  hinova-api \
  docker-compose.kinghost.yml

tar -tzf "$CODE_BACKUP" >/dev/null
```

### Restauração

Restauração de banco é uma operação destrutiva e deve ser feita somente com:

- backup validado;
- identificação correta do banco de destino;
- janela de manutenção;
- confirmação do ponto de restauração.

Evite automatizar restauração sem validação humana.

---

## 17. Health checks e observabilidade

### API

Endpoint público de saúde:

```http
GET /api/health
```

Resposta esperada inclui status `UP`.

### Web

O container web possui healthcheck interno em:

```text
/health
```

### PostgreSQL

O compose utiliza `pg_isready` para verificar a disponibilidade do banco.

### Logs do backend

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  logs --tail=200 backend
```

### Procurar erros recentes

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  logs --since=10m backend web \
  | grep -E "ERROR|Exception|FAILED|Access Denied|AuthorizationDeniedException" \
  || echo "NENHUM ERRO ENCONTRADO"
```

---

## 18. API — visão geral dos endpoints

Abaixo estão os grupos principais. A autorização efetiva é definida no `SecurityConfig` e também pode ser reforçada dentro dos controllers/services.

### Autenticação

```http
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/change-password
```

### Saúde

```http
GET /api/health
```

### Eventos / Checklist

```http
GET    /api/checklist/meta
GET    /api/checklist/tow-by-plate
GET    /api/checklist/events
POST   /api/checklist/events
GET    /api/checklist/events/{id}
PATCH  /api/checklist/events/{id}
DELETE /api/checklist/events/{id}
PATCH  /api/checklist/events/{eventId}/checklist/{itemId}
PATCH  /api/checklist/events/{eventId}/tow-checklist/{itemId}
POST   /api/checklist/events/{eventId}/third-parties
DELETE /api/checklist/events/{eventId}/third-parties/{thirdPartyId}
POST   /api/checklist/events/{eventId}/attachments
GET    /api/checklist/events/{eventId}/attachments/{attachmentId}
DELETE /api/checklist/events/{eventId}/attachments/{attachmentId}
POST   /api/checklist/events/{eventId}/complete-registration
PATCH  /api/checklist/events/{eventId}/review-status
GET    /api/checklist/events/{eventId}/dossier.pdf
GET    /api/checklist/events/{eventId}/internal-dossier.pdf
```

### Guincho / Reboque

```http
GET    /api/tow/template
GET    /api/tow/records
POST   /api/tow/records
GET    /api/tow/records/{id}
PATCH  /api/tow/records/{recordId}/items/{itemId}
POST   /api/tow/records/{recordId}/photos
GET    /api/tow/records/{recordId}/photos/{photoId}
DELETE /api/tow/records/{recordId}/photos/{photoId}
POST   /api/tow/records/{recordId}/complete
```

### Oficina

```http
GET   /api/workshop/events
GET   /api/workshop/events/{id}
PATCH /api/workshop/events/{eventId}/items/{itemId}
POST  /api/workshop/events/{eventId}/items/custom
POST  /api/workshop/events/{eventId}/mark-no-damage
POST  /api/workshop/events/{eventId}/complete
```

### Financeiro / Compras

```http
GET   /api/procurement/events
GET   /api/procurement/events/{id}
PATCH /api/procurement/events/{eventId}/purchases/{purchaseId}
```

### Aceite digital de Evento

```http
GET  /api/workshop/events/{eventId}/acceptance
POST /api/workshop/events/{eventId}/acceptance/prepare
GET  /api/public/events/acceptance/{token}
GET  /api/public/events/acceptance/{token}/dossier.pdf
POST /api/public/events/acceptance/{token}/registration-options
POST /api/public/events/acceptance/{token}/registration-finish
POST /api/public/events/acceptance/{token}/assertion-options
POST /api/public/events/acceptance/{token}/assertion-finish
```

### Cotação pública

```http
GET  /api/public/quotes/categories
GET  /api/public/quotes/promotional-motorcycle-prices
POST /api/public/quotes/options
POST /api/public/quotes
GET  /api/public/quotes/{id}
POST /api/public/quotes/{id}/decision
```

### Cotação interna

```http
POST /api/quotes/options
POST /api/quotes
GET  /api/quotes/{id}
POST /api/quotes/{id}/decision
POST /api/quotes/{id}/inspection
GET  /api/quotes/{id}/pdf
```

### Vistoria / Retrato

```http
POST /api/inspections
GET  /api/public/inspections/{token}
GET  /api/public/inspections/{token}/contract-change
POST /api/public/inspections/{token}/contract-change/decision
POST /api/public/inspections/{token}/upload
GET  /api/public/inspections/{token}/upload-chunk-status
POST /api/public/inspections/{token}/upload-chunk
POST /api/public/inspections/{token}/upload-chunk-raw
POST /api/public/inspections/{token}/finalize-upload
GET  /api/public/inspections/{token}/digital-acceptance
POST /api/public/inspections/{token}/digital-acceptance/registration-options
POST /api/public/inspections/{token}/digital-acceptance/registration-finish
POST /api/public/inspections/{token}/digital-acceptance/assertion-options
POST /api/public/inspections/{token}/digital-acceptance/assertion-finish
```

### Painel do Consultor

```http
GET    /api/consultant-dashboard/{consultantId}
POST   /api/consultant-dashboard/{consultantId}/quotes/{quoteId}/inspection
POST   /api/consultant-dashboard/{consultantId}/quotes/{quoteId}/redo
PATCH  /api/consultant-dashboard/{consultantId}/quotes/{quoteId}
POST   /api/consultant-dashboard/{consultantId}/quotes/{quoteId}/decision
DELETE /api/consultant-dashboard/{consultantId}/quotes/{quoteId}
```

### Análise

```http
GET   /api/analysis/inspections
GET   /api/analysis/inspections/analysts
PATCH /api/analysis/inspections/{id}/details
PATCH /api/analysis/inspections/{id}/contract-values
POST  /api/analysis/inspections/{id}/contract-pricing-preview
POST  /api/analysis/inspections/{id}/registration-complete
POST  /api/analysis/inspections/{id}/registration-not-complete
POST  /api/analysis/inspections/{id}/decision-message-sent
PATCH /api/analysis/inspections/{id}/status
```

### Supervisão

```http
GET   /api/supervision/inspections
PATCH /api/supervision/inspections/{id}/details
PATCH /api/supervision/inspections/{id}/contract-values
POST  /api/supervision/inspections/{id}/contract-pricing-preview
PATCH /api/supervision/inspections/{id}/supervision-note
POST  /api/supervision/inspections/{id}/registration-complete
POST  /api/supervision/inspections/{id}/registration-not-complete
PATCH /api/supervision/inspections/{id}/status
POST  /api/supervision/inspections/{id}/decision-message-sent
```

### Administração

O prefixo `/api/admin/**` concentra operações administrativas, incluindo:

- catálogo;
- usuários;
- consultores;
- cotações;
- vistorias;
- configurações;
- documentos públicos;
- auditoria.

Por segurança e manutenção, consulte os controllers em:

```text
backend/src/main/java/br/com/nh/cotacao/controller/
```

para a assinatura exata de cada endpoint e DTO utilizado pela versão em execução.

---

## 19. Retenção e limpeza de dados

A plataforma possui serviços de retenção configuráveis.

Exemplos:

```env
INSPECTION_RETENTION_DAYS=40
OPERATIONAL_RETENTION_DAYS=40
```

As rotinas de limpeza são disparadas por expressões cron configuráveis.

Antes de alterar esses valores em produção, avalie:

- política interna da associação;
- necessidade de auditoria;
- obrigações contratuais;
- estratégia de backup;
- impacto em arquivos e dossiês históricos.

---

## 20. Responsividade e experiência de uso

A camada responsiva final foi aplicada de forma compartilhada em todas as páginas da plataforma.

Faixas contempladas:

- smartphones estreitos e dobráveis;
- celulares comuns;
- tablets;
- notebooks compactos;
- desktops;
- orientação paisagem com pouca altura;
- safe areas/notch do iOS.

Comportamentos importantes:

- navegação interna adaptativa;
- grids que reduzem colunas automaticamente;
- inputs adequados ao mobile;
- modais limitados à altura útil da tela;
- tabelas largas com rolagem interna;
- botões com área de toque apropriada;
- textos/protocolos com proteção contra estouro de layout.

### Crédito global — V78

Todas as páginas HTML recebem o crédito padronizado:

```text
@desenvolvido por Carlos Lima
```

A implementação compartilhada fica em:

```text
web/shared/developer-footer.js
```

---

## 21. Histórico recente de versões

### V70 — navegação e login

- cabeçalho interno padronizado;
- login unificado por função;
- visão operacional ampliada do Admin;
- consultas administrativas de Evento, Oficina e Reboque.

### V71 — administração

- visualização/download de arquivos;
- fluxo administrativo de aceite;
- listas progressivas nos checklists.

### V72 — listas e auditoria

- `Ver mais` / `Ver menos`;
- paginação visual progressiva;
- padronização de coleções administrativas grandes.

### V74 — responsividade universal

- camada responsiva compartilhada;
- adaptação para mobile, tablet, notebook e desktop;
- melhorias de formulários, modais e tabelas.

### V77 — Eventos e Financeiro

- criação do perfil `EVENT_OPERATOR`;
- criação do perfil `BUYER`;
- Evento separado do fluxo de consultor;
- cadastro inicial com fotos/documentos;
- edição de Evento;
- remoção do preenchimento financeiro da Oficina;
- painel `/financeiro/`;
- compras com estados `REQUESTED` e `FINALIZED`;
- migration `V67`.

### V78 — exclusão administrativa e rodapé global

- exclusão permanente de Evento por `ADMIN`;
- ação de exclusão na Área de Eventos quando acessada por administrador;
- ação de exclusão na aba Eventos do Admin;
- confirmação explícita antes da exclusão;
- crédito global de desenvolvimento;
- preservação da correção de `ASYNC` e `ERROR` do Spring Security;
- nenhuma migration adicional.

---

## 22. Boas práticas de operação

### Antes de um deploy

- validar integridade do ZIP;
- confirmar a versão;
- criar backup do banco;
- criar backup do código;
- conferir mudanças no compose;
- conferir presença das migrations esperadas.

### Depois de um deploy

- verificar `docker compose ps`;
- validar `/api/health`;
- conferir migrations aplicadas;
- revisar logs do backend;
- revisar healthcheck do web;
- testar login dos perfis alterados;
- testar a funcionalidade que motivou a versão;
- renovar cache do navegador.

### Banco de dados

- não apagar volumes em deploy normal;
- manter backups fora do diretório temporário da atualização;
- validar backups com `gzip -t`;
- testar restauração periodicamente em ambiente separado.

---

## 23. Solução de problemas

### Backend não inicia

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  logs --tail=200 backend
```

Verifique principalmente:

- conexão com PostgreSQL;
- erro de Flyway;
- variável de ambiente ausente;
- porta/serviço indisponível;
- exceções do Spring durante bootstrap.

### Web não fica saudável

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  logs --tail=100 web
```

Depois teste internamente:

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  exec -T web wget -qO- http://127.0.0.1/health
```

### Verificar migration específica

Exemplo para V67:

```bash
docker compose \
  --env-file .env \
  -f docker-compose.kinghost.yml \
  exec -T database sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT installed_rank, version, description, success
    FROM flyway_schema_history
    WHERE version = '\''67'\'';
  "'
```

### Interface parece antiga após deploy

- execute `Ctrl+F5` no desktop;
- feche e reabra o navegador no celular;
- limpe o cache do site, se necessário;
- confirme que o container `web` foi recriado com a imagem nova.

### Erros `Access Denied` em streaming assíncrono

A V78 inclui a correção no `SecurityConfig` para `DispatcherType.ASYNC` e `DispatcherType.ERROR`. Se esse comportamento reaparecer, confirme se a versão em produção ainda contém:

```java
.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()
```

---

## 24. Segurança operacional

Este projeto deve ser tratado como aplicação de produção com dados reais.

Recomendações mínimas:

- use HTTPS sempre;
- mantenha Docker e sistema operacional atualizados;
- restrinja SSH por chave sempre que possível;
- evite senha de root compartilhada;
- use firewall;
- limite exposição de portas;
- não exponha PostgreSQL publicamente;
- armazene segredos somente em `.env`/secret manager;
- troque credenciais padrão antes de produção;
- aplique backups automáticos;
- mantenha cópias de backup em local externo;
- revise contas ativas periodicamente;
- monitore logs de autenticação e erros;
- não reutilize credenciais entre perfis;
- valide permissões no backend, não apenas no frontend;
- revise cuidadosamente qualquer alteração em migrations destrutivas.

---

## 25. Créditos

**Projeto:** NH Plataforma — Novo Horizonte Proteção Veicular  
**Desenvolvimento:** **Carlos Lima**  
**Versão documentada:** **V78 — 23/09/2026**

A interface da V78 inclui o crédito global:

```text
@desenvolvido por Carlos Lima
```

---

## Observação sobre propriedade e distribuição

Este repositório contém código e regras de negócio específicas da operação da Novo Horizonte Proteção Veicular. A autorização para uso, cópia, distribuição, modificação ou entrega a terceiros deve seguir os contratos e acordos aplicáveis ao projeto.

Na ausência de um arquivo de licença explícito no repositório, não presuma que o código é software livre ou de domínio público.
