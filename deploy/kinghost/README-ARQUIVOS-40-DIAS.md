# Arquivos do Retrato NH no PostgreSQL

Fotos, vídeo, assinatura, CRLV, RG/CNH e relatório são armazenados no PostgreSQL e disponibilizados aos painéis autenticados. Cada arquivo recebe uma data de expiração de 40 dias. A rotina agendada remove o conteúdo binário expirado e mantém somente os metadados para histórico.

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
```

Não use `docker compose down -v`, porque isso remove o volume do PostgreSQL.
