# Arquivos do Retrato NH no PostgreSQL

Fotos, vídeo, assinatura, CRLV, RG/CNH e relatório são armazenados no PostgreSQL e disponibilizados aos painéis autenticados durante a janela operacional. A presença de arquivo impede somente o vencimento comercial da vistoria no prazo curto de realização; ela não torna os dados permanentes. Após 40 dias, cotação, vistoria e respectivos arquivos são excluídos do sistema independentemente do status (aceita, aprovada, em análise, expirada etc.).

## Aplicar a atualização

```bash
bash deploy/kinghost/apply-database-media-update.sh
```

## Conferir uso do banco

```bash
bash deploy/kinghost/inspection-storage-status.sh
```

## Variáveis opcionais

```env
INSPECTION_RETENTION_DAYS=40
INSPECTION_CLEANUP_CRON=0 15 * * * *
OPERATIONAL_RETENTION_DAYS=40
OPERATIONAL_RETENTION_CLEANUP_CRON=0 40 * * * *
```

Não use `docker compose down -v`, porque isso remove o volume do PostgreSQL.
