# Atualização dos painéis e da API do Retrato NH

## Painel do consultor

- Cotações e vistorias são localizadas pelo cadastro do consultor e também pelo nome histórico normalizado.
- O vínculo funciona para consultores importados, cadastrados no portal e voluntários.
- A migração `V26__repair_consultant_activity_ownership.sql` relaciona atividades antigas que ainda estavam sem `consultant_id`.
- Cotações antigas sem CPF continuam visíveis e solicitam o CPF somente ao iniciar a vistoria ou refazer uma cotação vencida.
- O consultor pode rever o PDF, refazer uma cotação vencida e excluir uma cotação a qualquer momento.
- Na vistoria, o consultor pode iniciar/continuar o envio, solicitar os arquivos pelo WhatsApp e consultar os documentos já armazenados.

## API e armazenamento dos arquivos

- Fotos, vídeos, assinatura, PDF, DOC, DOCX, ODT, RTF, TXT e imagens de documentos são armazenados no PostgreSQL.
- O conteúdo binário fica em `inspection_asset_contents`; os metadados e a validade ficam em `inspection_assets`.
- O envio em partes confirma o conteúdo binário no banco antes de responder sucesso.
- Arquivos adicionais usam o tipo `OTHER_DOCUMENT` e aceitam até 20 itens por vistoria.
- Limites atuais: imagens até 12 MB, documentos até 30 MB e vídeos até 220 MB.
- Admin, analista e consultor podem visualizar ou baixar os arquivos pelo botão **Ver documentos enviados**.
- Os arquivos ficam disponíveis por 40 dias e depois são removidos automaticamente.

## Correção de persistência

- Novos `InspectionAsset` são persistidos diretamente com `EntityManager.persist`.
- Entidades de vistoria já gerenciadas são apenas sincronizadas com `flush`, evitando o erro do Hibernate de dois objetos com o mesmo identificador na mesma sessão.
