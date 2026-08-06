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
- Novos conteúdos binários ficam em `inspection_asset_blob_chunks`, agrupados por `inspection_asset_blobs`; metadados e validade continuam em `inspection_assets`.
- Cada parte do envio é gravada imediatamente no PostgreSQL. Não existe mais diretório permanente de upload no backend.
- O arquivo só é marcado como `COMPLETE` depois da conferência da quantidade de partes e da soma exata dos bytes.
- Conteúdos antigos de `inspection_asset_contents` continuam compatíveis para leitura e download.
- Arquivos adicionais usam o tipo `OTHER_DOCUMENT` e aceitam até 20 itens por vistoria.
- Limites atuais: imagens até 12 MB, documentos até 30 MB e vídeos até 220 MB.
- Admin, analista e consultor podem visualizar ou baixar os arquivos pelo botão **Ver documentos enviados**.
- Os arquivos ficam disponíveis por 40 dias e depois são removidos automaticamente.

## Correção de persistência

- Novos `InspectionAsset` são persistidos diretamente com `EntityManager.persist`.
- Entidades de vistoria já gerenciadas são apenas sincronizadas com `flush`, evitando o erro do Hibernate de dois objetos com o mesmo identificador na mesma sessão.

- A migração `V27__inspection_binary_chunks_in_postgresql.sql` cria a persistência retomável transacional.
- O endpoint antigo de fotos da cotação, que usava Drive, foi desativado; todo envio deve passar pelo Retrato NH.
- O script `deploy/kinghost/verificar-arquivos-banco.sh` comprova no VPS quais arquivos e bytes estão realmente dentro do PostgreSQL.
