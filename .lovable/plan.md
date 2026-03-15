
Objetivo: estabilizar a Fase 3 e o carregamento de campos/pipelines do Bitrix24, eliminando falhas silenciosas e garantindo separação correta entre “já tem Deal” vs “não tem Deal”.

1) Diagnóstico confirmado (o que está quebrando hoje)
- Campos Bitrix não carregam:
  - `bitrix24-fields` busca integração por `connector_active=true` quando `member_id` não é enviado.
  - A integração atual está `connector_active=false`, então a função retorna “No active Bitrix24 integration”.
  - Em `Bitrix24App.tsx`, `MapeamentoView` recebe `memberId` sem fallback para `integration.member_id`.
  - Em `useBitrixFields.ts`, o request não envia `member_id`.
- Sincronização Fase 3 incompleta:
  - `import-access-data` em `list_sync_clients` está limitado a 1000 registros por query (limite padrão), então não varre toda a base.
  - Hoje há 1058 clientes importados e 1019 com leads de importação; a resposta atual retorna `total: 1000`.
- Separação de etapas não está 100% alinhada com a regra:
  - “Etapa A” hoje considera `bitrix_deal_id OR bitrix_contact_id`; deveria focar em Deal existente.
- Pipelines:
  - Há paginação no `bitrix24-fetch-entities`, mas falta tratamento de erro/token e feedback mais explícito quando falha.

2) Plano de correção (implementação)
A. Corrigir carregamento de campos Bitrix (prioridade alta)
- `src/pages/Bitrix24App.tsx`
  - Passar `memberId={memberId || integration?.member_id}` para `MapeamentoView`.
- `src/hooks/useBitrixFields.ts`
  - Enviar `member_id` no request (obtido de querystring/BX24/integration fallback).
  - Remover chamada dupla desnecessária e padronizar uma única chamada com query params completos.
- `supabase/functions/bitrix24-fields/index.ts`
  - Fallback robusto quando não vier `member_id`: usar integração mais recente (`updated_at desc`) em vez de exigir `connector_active=true`.
  - Manter refresh automático de token e retorno com erro claro.

B. Corrigir Fase 3 para processar todos os clientes
- `supabase/functions/import-access-data/index.ts` (modo `list_sync_clients`)
  - Paginar leitura de `clients` e `leads` para ultrapassar limite de 1000.
  - Montar `financialMap` com dataset completo (todos os clientes elegíveis).
  - Incluir também `client_contacts` no enriquecimento de telefone/email (além de `leads`).
- Preservar matching atual por ordem:
  - Access ID (EF) → NIF/CPF → Telefone → Email → Nome+Sobrenome.
- Normalizar melhor comparações (trim/case/telefone só dígitos).

C. Ajustar segmentação de etapas na UI (regra de negócio)
- `src/pages/Bitrix24App.tsx` (Fase 3)
  - Etapa A: apenas clientes com `bitrix_deal_id`.
  - Etapa B: clientes sem `bitrix_deal_id` (mesmo que tenham contacto).
  - Exibir badge de tipo de match e subtipo “contact-only” para transparência operacional.

D. Fortalecer pipelines e erros visíveis
- `supabase/functions/bitrix24-fetch-entities/index.ts`
  - Adicionar refresh de token (mesmo padrão de `bitrix24-fields`) antes de chamadas Bitrix.
  - Log e retorno de erro estruturado quando API Bitrix falhar.
- `src/pages/Bitrix24App.tsx` (Fase 3)
  - Se `resolvedMemberId` ausente: bloquear ações e mostrar mensagem de ação clara.
  - Mostrar erro de carregamento de pipelines (não apenas fallback silencioso).
  - Exibir contagem real retornada pela API (`total_pipelines`).

3) Arquivos que serão alterados
- `src/pages/Bitrix24App.tsx`
- `src/hooks/useBitrixFields.ts`
- `supabase/functions/bitrix24-fields/index.ts`
- `supabase/functions/import-access-data/index.ts`
- `supabase/functions/bitrix24-fetch-entities/index.ts`

4) Validação fim-a-fim (obrigatória)
- Campos Bitrix:
  - Abrir Mapeamento/Fluxos e confirmar lista de campos carregada (lead/deal/spa).
- Pipelines:
  - Fase 3 deve listar pipelines sem depender de estado “connector_active”.
- Sincronização:
  - Carregar clientes e confirmar total acima de 1000 quando aplicável.
  - Verificar separação:
    - Etapa A = com Deal existente.
    - Etapa B = sem Deal.
  - Testar 1 caso por tipo de match (EF, NIF, telefone, email, nome+sobrenome).
- Data de contrato:
  - Confirmar que novos Deals usam data histórica de contratação (coluna F importada).

5) Nota técnica curta
Fluxo alvo:
```text
UI (member_id resolvido) 
  -> list_sync_clients (dataset completo, sem corte 1000)
    -> matching determinístico (EF > NIF > Phone > Email > Nome)
      -> Etapa A (deal existe) / Etapa B (deal não existe)
        -> sync_single_client (respeita data contratual histórica)
```
