# NH Plataforma

Plataforma web desenvolvida para a **Novo Horizonte Proteção Veicular**, centralizando cotação, vistoria digital, análise, supervisão, gestão administrativa e geração de dossiês em PDF.

O projeto integra o fluxo comercial e operacional da associação em uma única solução, com controle de acesso por perfil, rastreabilidade das vistorias, evidências digitais, integração com a Hinova e infraestrutura containerizada para produção.

> Status: **em produção** em `https://nhprotecao.com.br/`.

---

## Principais módulos

### Cota

- Geração de cotações personalizadas.
- Planos, coberturas, adicionais e regras por categoria de veículo.
- Regras específicas para motocicletas e faixas promocionais.
- Valor FIPE, vencimento, validade e identificação da cotação.
- Comparação de planos para envio ao associado.
- Integração com o fluxo do consultor.

### Retrato NH

- Vistoria veicular digital por link.
- Captura orientada de fotos e documentos.
- Selfie do associado em frente ao veículo.
- Upload de imagens, vídeos e documentos.
- Reenvio somente de arquivos faltantes ou recusados.
- Armazenamento dos arquivos da vistoria no PostgreSQL.
- Controle de retenção de arquivos operacionais.

### Equipe de Análise

- Fila individual por analista.
- Vínculo de consultores a analistas responsáveis.
- Até 30 consultores vinculados por analista.
- Status operacionais de cadastro.
- Identificação do analista responsável em cada vistoria.
- Pendências e reenvio de documentos.
- Visualização da **O.B.S. Supervisão** ao abrir a vistoria.

### Supervisão de Análise

- Acompanhamento de todas as vistorias enviadas para análise.
- Visualização de vistorias ainda não analisadas, sem documentos ou com cadastro pendente.
- Aba **Vistorias pendentes dos analistas**.
- Identificação do analista responsável por vistoria.
- Inclusão de **O.B.S. Supervisão** com autor e data da alteração.
- Toda vistoria marcada como **Cadastro feito**, inclusive quando a análise foi executada pelo administrador, passa obrigatoriamente pela fila da Supervisão antes da decisão final.
- Decisão final de aprovação ou rejeição pela Supervisão ou pelo administrador atuando explicitamente com poderes de Supervisão.
- Histórico de aprovadas e rejeitadas, com identificação de quem tomou a decisão final.

### Dossiê e relatórios PDF

- Geração de relatório consolidado da vistoria.
- Layout institucional padronizado da Novo Horizonte.
- CPF completo do associado no documento.
- Fotos organizadas em grade.
- Documentos exibidos visualmente no dossiê.
- Conversão de páginas de PDF anexado para visualização no relatório.
- Página de decisão da Supervisão antes do regulamento.
- Inclusão do PPV/regulamento no dossiê final.
- Registro da Supervisão e assinatura do associado em miniatura no rodapé das páginas do dossiê.
- Relatório consolidado permanente, sem expiração operacional.
- Padronização e regeneração de relatórios históricos quando os dados necessários ainda estão disponíveis.

### Aceite digital WebAuthn

- Fluxo de aceite digital após aprovação da Supervisão.
- Link/token de aceite enviado ao associado.
- Suporte à verificação do usuário pelo autenticador do dispositivo.
- Registro de evidências do aceite, incluindo:
  - data e hora;
  - IP;
  - metadados do dispositivo;
  - geolocalização quando autorizada;
  - hash SHA-256 da selfie;
  - hash SHA-256 do dossiê;
  - hash da evidência;
  - dados da credencial WebAuthn;
  - confirmação de verificação do usuário.

> O sistema utiliza WebAuthn para comprovação técnica do aceite pelo dispositivo. Uma assinatura ICP-Brasil depende de certificado digital e integração específica com um provedor/certificado habilitado.

### Administração

- Gestão de colaboradores.
- Perfis e permissões.
- Consultores, analistas e Supervisão.
- Administrador principal identificado operacionalmente como **Pedro Henrique**.
- Pode realizar a análise administrativa e marcar **Cadastro feito**, encaminhando obrigatoriamente a vistoria para a Supervisão.
- Possui os mesmos poderes da Supervisão para aprovar/rejeitar quando a vistoria já estiver na fila de decisão final.
- Pode registrar **O.B.S. Supervisão** para os analistas e enviar o link/token de aceite digital WebAuthn ao associado após a aprovação.
- Catálogo de planos e coberturas.
- Categorias de veículos.
- Faixas de preço e regras de cobertura.
- Configurações operacionais.
- Auditoria de alterações administrativas.

### Consulta de boletos

- Integração com a **Hinova SGA V2**.
- Consulta por CPF/CNPJ.
- Agrupamento por veículo.
- Regras de inadimplência por placa.
- Redirecionamento seguro para boleto.

---

## Perfis de acesso

A aplicação possui os seguintes papéis internos:

| Perfil | Responsabilidade |
| --- | --- |
| `CONSULTANT` | Cotação, geração de vistoria e acompanhamento dos próprios associados |
| `ANALYST` | Conferência das vistorias e atualização do cadastro |
| `SUPERVISION_ANALYSIS` | Acompanhamento da equipe de análise e decisão final |
| `ADMIN` | Administração geral; pode analisar, registrar O.B.S., atuar como Supervisão na decisão final e enviar o aceite digital |

---

## Fluxo principal da vistoria

```text
Consultor
   ↓
Gera o Retrato NH
   ↓
Associado envia fotos, selfie, vídeos e documentos
   ↓
Vistoria entra na fila da Equipe de Análise
   ↓
Analista ou Admin (Pedro Henrique) confere os arquivos
   ↓
Cadastro feito / Cadastro não feito / Aguardando documentos
   ↓
Cadastro feito entra obrigatoriamente na fila da Supervisão
   ↓
Supervisão acompanha e registra O.B.S.
   ↓
Supervisão ou Admin atuando como Supervisão aprova/rejeita
   ↓
Dossiê PDF consolidado
   ↓
Associado realiza aceite digital WebAuthn
   ↓
Evidências digitais vinculadas ao processo
```

---

## Arquitetura

```text
                        ┌───────────────────────┐
                        │     Caddy / HTTPS     │
                        │  nhprotecao.com.br    │
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │      Web / Nginx      │
                        │ HTML + CSS + JS       │
                        └───────┬───────┬───────┘
                                │       │
                 ┌──────────────┘       └──────────────┐
                 │                                     │
       ┌─────────▼──────────┐                ┌─────────▼──────────┐
       │ Spring Boot API    │                │ Hinova API Proxy   │
       │ Java 21            │                │ Node.js            │
       └─────────┬──────────┘                └────────────────────┘
                 │
       ┌─────────▼──────────┐
       │ PostgreSQL 16      │
       │ + Flyway           │
       └────────────────────┘
```

---

## Tecnologias

### Backend

- Java 21
- Spring Boot 3.4.5
- Spring Web
- Spring Data JPA
- Spring Security
- Bean Validation
- Flyway
- PostgreSQL
- OpenPDF 2.2.3
- Apache PDFBox 3.0.3
- Google Drive API

### Frontend

- HTML5
- CSS3
- JavaScript Vanilla
- Nginx
- Layout responsivo para desktop, tablet e mobile

### Integrações

- Hinova SGA V2
- WhatsApp Cloud API
- Google Drive, quando habilitado
- WebAuthn

### Infraestrutura

- Docker
- Docker Compose
- PostgreSQL 16 Alpine
- Caddy 2
- HTTPS automático com Let's Encrypt
- Deploy em VPS KingHost

---

## Estrutura do projeto

```text
.
├── backend/
│   ├── src/main/java/
│   ├── src/main/resources/
│   │   ├── db/migration/
│   │   └── default-documents/
│   ├── Dockerfile
│   └── pom.xml
│
├── hinova-api/
│   ├── server.js
│   ├── consultar-boletos-associado.js
│   ├── baixar-boleto.js
│   └── Dockerfile
│
├── web/
│   ├── admin/
│   ├── analise/
│   ├── colaborador/
│   ├── cota/
│   ├── retrato/
│   ├── supervisao/
│   ├── shared/
│   ├── nginx.conf
│   └── Dockerfile
│
├── deploy/kinghost/
├── docker-compose.yml
├── docker-compose.kinghost.yml
├── render.yaml
└── README.md
```

---

## Banco de dados e migrations

O schema é versionado com **Flyway**.

O projeto atualmente contém migrations até a versão **V45**, incluindo evoluções para:

- catálogo e regras de preço;
- cotações;
- vistoria digital;
- armazenamento de arquivos;
- usuários e colaboradores;
- equipe de análise;
- Supervisão;
- relatório permanente;
- evidências WebAuthn;
- fila de pendências dos analistas e O.B.S. da Supervisão;
- fluxo obrigatório Admin → Supervisão para análises administrativas;
- decisão final do Admin registrada separadamente como `ADMIN_SUPERVISION`.

As migrations são aplicadas automaticamente durante a inicialização do backend.

---

## Executando localmente com Docker

### Pré-requisitos

- Docker Desktop ou Docker Engine
- Docker Compose

### 1. Clone o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd <PASTA_DO_PROJETO>
```

### 2. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz.

Utilize os arquivos de exemplo do projeto como referência e **não versione credenciais reais**.

Principais grupos de configuração:

```env
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=

AUTH_TOKEN_SECRET=
AUTH_TOKEN_HOURS=

ADMIN_USERNAME=
ADMIN_PASSWORD=
CONSULTANT_USERNAME=
CONSULTANT_PASSWORD=
ANALYST_USERNAME=
ANALYST_PASSWORD=

TEAM_WHATSAPP_NUMBER=
TEAM_EMAIL=

HINOVA_API_BASE_URL=
HINOVA_API_TOKEN=
HINOVA_API_USER=
HINOVA_API_PASSWORD=
HINOVA_API_USER_TOKEN=

WHATSAPP_CLOUD_ENABLED=false
WHATSAPP_CLOUD_API_VERSION=
WHATSAPP_CLOUD_PHONE_NUMBER_ID=
WHATSAPP_CLOUD_ACCESS_TOKEN=

INSPECTION_RETENTION_DAYS=40
OPERATIONAL_RETENTION_DAYS=40
```

### 3. Suba o ambiente local

```bash
docker compose up -d --build
```

A aplicação web ficará disponível em:

```text
http://localhost:3000
```

### 4. Acompanhe o backend

```bash
docker compose logs -f backend
```

### 5. Encerrar o ambiente

```bash
docker compose down
```

> Evite `docker compose down -v` se quiser preservar o banco local.

---

## Deploy na KingHost

A produção utiliza:

```text
docker-compose.kinghost.yml
```

Build dos serviços de aplicação:

```bash
docker compose \
  -p nh-plataforma \
  -f docker-compose.kinghost.yml \
  build backend hinova-api web
```

Atualização sem recriar banco e Caddy:

```bash
docker compose \
  -p nh-plataforma \
  -f docker-compose.kinghost.yml \
  up -d --no-deps backend hinova-api web
```

Verificação:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

```bash
curl -I https://nhprotecao.com.br/
```

Em produção, todos os serviços utilizam a rede Docker `nh-plataforma_internal`.

---

## Segurança

- Credenciais e tokens são fornecidos por variáveis de ambiente.
- Arquivos `.env` não devem ser enviados ao repositório.
- O backend utiliza Spring Security.
- Sessões do portal utilizam token de autenticação.
- Credenciais de integração não são expostas no frontend.
- O download de boletos utiliza rota intermediária.
- O aceite WebAuthn registra evidências criptográficas associadas à vistoria.
- HTTPS é terminado pelo Caddy.
- Arquivos e relatórios possuem regras específicas de retenção.
- O relatório consolidado aprovado é preservado como registro permanente.

### Recomendações para produção

- Utilize senhas fortes e exclusivas.
- Gere um `AUTH_TOKEN_SECRET` longo e aleatório.
- Nunca use credenciais de desenvolvimento em produção.
- Mantenha backups regulares do PostgreSQL.
- Monitore espaço em disco e logs dos containers.
- Regere imediatamente qualquer token que tenha sido exposto.

---

## Testes

O backend possui testes automatizados em:

```text
backend/src/test/java
```

Para executar com Maven:

```bash
cd backend
mvn test
```

Ou pelo build Docker:

```bash
docker compose build backend
```

---

## Próximas evoluções

A arquitetura está preparada para continuar evoluindo em áreas como:

- multiempresa / multi-tenant;
- Super Admin da plataforma;
- planos comerciais por empresa;
- identidade visual por tenant;
- isolamento de usuários e dados por empresa;
- ativação de módulos por contrato;
- gestão de cobrança e bloqueio por inadimplência.

---

## Autor

Desenvolvido por **Carlos Lima**.

- GitHub: `developercarloslima`
- LinkedIn: [https://www.linkedin.com/in/devcarloslima/](https://www.linkedin.com/in/devcarloslima/)

---

## Direitos autorais e propriedade intelectual

© 2026 **Carlos Lima**. Todos os direitos reservados.

A titularidade dos direitos autorais e da propriedade intelectual sobre o **código-fonte, arquitetura, documentação, regras de negócio implementadas, componentes, integrações e demais materiais técnicos deste repositório pertence a Carlos Lima**.

A **Novo Horizonte Proteção Veicular** possui o direito de utilização da plataforma para sua operação conforme os acordos aplicáveis ao projeto. A disponibilização deste repositório não transfere a titularidade da propriedade intelectual a terceiros.

É proibida a cópia, modificação, redistribuição, sublicenciamento, comercialização ou reutilização total ou parcial deste código por terceiros sem autorização prévia e expressa de **Carlos Lima**.

Para solicitações relacionadas ao uso do código ou da propriedade intelectual, entre em contato pelo [LinkedIn de Carlos Lima](https://www.linkedin.com/in/devcarloslima/).
