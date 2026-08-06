# Edição segura de cotações pelo consultor

## Campos que podem ser corrigidos a qualquer momento

- Nome do associado
- CPF
- WhatsApp
- Placa
- Modelo do veículo
- Ano de fabricação
- Indicação de veículo 0 km

## Campos protegidos pelo backend

- Categoria do veículo
- Valor FIPE
- Região e origem da motocicleta
- Plano
- Coberturas e opcionais
- Taxas
- Valor base e valor mensal

A API recebe somente os campos permitidos e cria uma fotografia dos campos comerciais antes da edição. Se qualquer informação protegida mudar durante a transação, toda a alteração é revertida.

Quando já existe um Retrato NH vinculado, nome, CPF, WhatsApp e placa são sincronizados com a vistoria. Os arquivos enviados não são alterados.

Endpoint:

```http
PATCH /api/consultant-dashboard/{consultantId}/quotes/{quoteId}
```
