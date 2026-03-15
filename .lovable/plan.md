

## Problemas Identificados

### 1. Pipelines de destino nao carregam
A Edge Function `bitrix24-fetch-entities` funciona correctamente. O Bitrix24 so tem o "Pipeline Geral" (confirmado via teste directo). Se existem mais pipelines no Bitrix, o problema pode ser que o token expirou — mas o endpoint retornou `success: true` com dados validos.

**Accao**: Nao ha bug aqui. Se o utilizador espera ver mais pipelines, precisa cria-las no Bitrix24. Podemos adicionar um estado visual melhor (mostrar "1 pipeline encontrada" em vez de parecer vazio).

### 2. Clientes nao carregam (lentidao extrema)
Ha **1058 clientes** importados. O carregamento faz batch de 20 clientes, e para **cada cliente** executa:
- 1 query a `client_contacts` (tabela vazia — 0 registos)
- 1 query nested a `leads → cases → proposals → contracts → financial_records`
- Ate 3 chamadas API ao Bitrix24 (lookup por UF, NIF, phone)

Isto resulta em **~4-5 chamadas Bitrix por cliente × 20 = ~100 chamadas por batch × 53 batches**. O timeout da Edge Function mata o processo.

**Accao**: Optimizar o carregamento — fazer lookup Bitrix em batch (crm.deal.list com filtro de lista) em vez de um-a-um. Tambem pre-filtrar clientes sem financial_records na query SQL para nao ter de iterar sobre todos.

### 3. Correspondencia (matching) limitada
Actualmente so busca por: UF_CRM_1768312831 (access ID) → NIF (UF_CRM_EMMELY_NIF) → Telefone (que esta sempre vazio porque `client_contacts` tem 0 registos).

O utilizador quer matching por: **Telefone, Email, NIF/CPF, Nome Completo**.

---

## Plano de Alteracoes

### Edge Function `import-access-data` — mode `list_sync_clients`

1. **Optimizar query SQL**: Em vez de iterar cliente-a-cliente com `fetchClientWithFinancials`, fazer uma query agregada que traga todos os clientes com totais financeiros numa unica consulta SQL (ou pelo menos pre-filtrar os que tem `financial_records`).

2. **Batch lookup Bitrix**: Em vez de fazer N chamadas Bitrix por cliente, carregar uma lista de deals do Bitrix em batch e fazer o matching no servidor:
   - Buscar todos os deals com `UF_CRM_1768312831` preenchido (uma unica chamada paginada)
   - Buscar todos os contactos com `UF_CRM_EMMELY_NIF` preenchido
   - Fazer o matching em memoria

3. **Adicionar matching por nome completo**: Apos UF → NIF → Telefone, adicionar lookup por `crm.contact.list` com `filter: { FULL_NAME: clientName }` como fallback.

4. **Incluir telefones/emails dos leads**: Como `client_contacts` esta vazia, tambem buscar telefone/email da tabela `leads` associados ao `client_id`.

### Frontend `src/pages/Bitrix24App.tsx` — ImportacaoAccessView

5. **Pipeline feedback visual**: Mostrar texto "X pipelines encontradas" ou "Nenhuma pipeline extra" para clarificar que nao e um erro.

6. **Progresso de carregamento**: Mostrar barra de progresso durante o carregamento dos clientes (ja existe `processed/total` na resposta).

### Ficheiros alterados
- `supabase/functions/import-access-data/index.ts` — optimizar `list_sync_clients` e `sync_single_client`
- `src/pages/Bitrix24App.tsx` — melhorar feedback visual de pipelines e progresso de carregamento

