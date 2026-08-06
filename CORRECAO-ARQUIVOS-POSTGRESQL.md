# Retrato NH — persistência definitiva no PostgreSQL

## Problema corrigido

O fluxo anterior gravava cada parte do upload em `/var/lib/nh/uploads`. O banco só recebia o arquivo depois que todas as partes fossem reunidas. Uma queda de conexão, reinício ou erro de transação deixava os arquivos no volume do servidor e nenhum conteúdo confirmado no PostgreSQL.

## Nova arquitetura

A migração `V27` cria duas tabelas:

- `inspection_asset_blobs`: sessão, metadados, tamanho, quantidade de partes e estado do arquivo;
- `inspection_asset_blob_chunks`: conteúdo binário de cada parte em `BYTEA`.

Cada parte enviada é confirmada em uma transação própria no PostgreSQL. O arquivo só recebe o estado `COMPLETE` quando:

1. todas as partes existem;
2. os índices vão de zero até a última parte;
3. a soma dos bytes corresponde exatamente ao tamanho declarado;
4. o metadado `inspection_assets` foi associado ao conteúdo.

O fluxo não usa mais volume permanente para uploads. Fotos, vídeos, PDF, DOC, DOCX, ODT, RTF, TXT, CRLV, RG/CNH, assinatura e relatório ficam no banco durante o prazo de retenção.

## Compatibilidade

Arquivos antigos já gravados em `inspection_asset_contents` continuam disponíveis para leitura e download. Novos arquivos utilizam as tabelas de chunks da `V27`.

O endpoint antigo `/api/quotes/{id}/inspection`, que enviava fotos ao Google Drive, foi desativado. Toda vistoria deve usar o Retrato NH.

## Verificação no VPS

```bash
cd /opt/nh-plataforma/nh-plataforma-demo-main
bash deploy/kinghost/verificar-arquivos-banco.sh
```

O comando mostra a migração aplicada, quantidade e tamanho dos arquivos, partes persistidas, inconsistências e os últimos arquivos confirmados.
