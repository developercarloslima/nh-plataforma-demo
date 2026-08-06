# Correção da API de arquivos do Retrato NH

- O envio em partes confirma o conteúdo binário no PostgreSQL antes de responder sucesso.
- O frontend só considera o arquivo enviado quando `available=true` e a API confirma a existência do conteúdo.
- Após a gravação, a entidade é recarregada do banco para evitar respostas com coleção desatualizada.
- A migração V25 define `DATABASE` como armazenamento padrão e marca metadados antigos sem conteúdo como indisponíveis.
- O cache do Retrato NH foi atualizado para carregar a versão corrigida.
