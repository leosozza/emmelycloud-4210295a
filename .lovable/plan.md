
Objetivo: corrigir a Fase 3 para (1) carregar todas as pipelines corretamente, (2) separar claramente clientes com Deal já existente vs clientes novos no Bitrix, usando matching por Telefone/Email/NIF-CPF/Nome+Sobrenome, e (3) respeitar a data de contrato (coluna F de honorários).

Diagnóstico atual (com base no código + requests):
1) A Fase 3 está a enviar `member_id: null` em `list_sync_clients`, então o backend não faz lookup no Bitrix e tudo aparece como “novo”.
2) O carregamento de pipelines na UI depende de `memberId` e não de fallback para `integration.member_id`, por isso pode não carregar categorias reais.
3) O matching em lote atual não cobre bem “Deal existente” porque carrega Deals com filtro `!UF_CRM_1768312831` (limitando o universo), e por Email/Nome ele encontra contato mas nem sempre resolve o Deal associado.
4) A UI ainda não separa “já existe no Bitrix” vs “não existe”.
5) A data histórica já é preservada localmente no import (created_at baseado em `DATA`), mas essa data não está a ser aplicada de forma explícita no Deal sincronizado no Bitrix.

Plano de implementação

1) Corrigir resolução de `member_id` na Fase 3 (frontend)
- Em `src/pages/Bitrix24App.tsx`, criar `resolvedMemberId = memberId || integration?.member_id`.
- Usar `resolvedMemberId` em:
  - carregar pipelines,
  - `list_sync_clients`,
  - `sync_single_client`.
- Se não houver `resolvedMemberId`, mostrar erro orientativo e bloquear botão de sync.
Resultado esperado: pipelines e matching passam a consultar o Bitrix corretamente.

2) Garantir carregamento completo de pipelines (backend + frontend)
- Em `supabase/functions/bitrix24-fetch-entities/index.ts`:
  - Paginar `crm.dealcategory.list` (loop com `start`) para trazer todas as categorias.
  - Retornar metadados (`total_pipelines`, opcionalmente IDs).
- Em `Bitrix24App.tsx`:
  - Exibir contador real (“X pipelines encontradas”).
Resultado esperado: lista de pipeline de destino completa e confiável.

3) Reforçar matching para identificar Deal existente com precisão
- Em `supabase/functions/import-access-data/index.ts` (modo `list_sync_clients`):
  - Buscar Deals em lote sem restringir apenas ao campo de Access ID.
  - Indexar Deals por:
    - Access ID (`UF_CRM_1768312831`)
    - NIF/CPF (`UF_CRM_EMMELY_NIF`)
    - Contact ID (para resolver match via contato).
  - Indexar contatos por telefone normalizado, email normalizado e nome completo normalizado.
  - Regra de nome: só considerar match quando tiver pelo menos nome + sobrenome.
  - Sequência de matching: Access ID → NIF/CPF → Telefone → Email → Nome completo.
  - Após match de contato, tentar resolver Deal existente pelo contato.
  - Retornar campos extras: `match_type`, `exists_deal`, `exists_contact_only`, `is_new`.
- Aplicar mesma lógica em `sync_single_client` para consistência.
Resultado esperado: separação real entre “já existe Deal” e “não existe Deal”.

4) Separar fluxo em 2 etapas na UI da Fase 3
- Em `src/pages/Bitrix24App.tsx`:
  - Adicionar segmentação principal:
    - “Etapa A: Sincronizar existentes (Deal já existe)”
    - “Etapa B: Cadastrar novos (sem Deal)”
  - Manter status financeiro (Atrasado/Em Aberto/Quitado) como filtro secundário.
  - Mostrar badge de tipo de match por linha (Access/NIF/Telefone/Email/Nome/Novo).
  - Batch actions aplicadas por etapa atual.
Resultado esperado: operação mais segura e clara para equipa (atualizar existentes vs criar novos).

5) Respeitar data de contrato na sincronização
- Em `import-access-data`:
  - Incluir no payload do cliente a data contratual histórica (ex.: menor `created_at` dos registos importados daquele serviço/cliente).
- Em `sync_single_client`:
  - Ao criar Deal novo: enviar essa data como campo de data de início do negócio (ex.: `BEGINDATE`).
  - Ao atualizar Deal existente: atualizar data apenas quando fizer sentido (não sobrescrever indevidamente histórico se já estiver preenchido).
  - Manter `due_date` das parcelas para vencimento de faturas (já existente).
Resultado esperado: Bitrix refletir cronologia original da contratação (coluna F).

Arquivos previstos
- `src/pages/Bitrix24App.tsx`
- `supabase/functions/import-access-data/index.ts`
- `supabase/functions/bitrix24-fetch-entities/index.ts`
- Sem migração de base de dados para esta correção.

Validação (fim a fim)
1) Abrir Fase 3 e confirmar pipelines reais carregadas (contagem > “Pipeline Geral”, quando houver).
2) Carregar clientes e validar que aparecem dois grupos:
   - com Deal existente,
   - novos sem Deal.
3) Testar 1 cliente por cada match_type (telefone, email, NIF/CPF, nome+sobrenome).
4) Sincronizar em lote cada etapa e validar resultado no Bitrix.
5) Confirmar que Deal novo ficou com data de contrato histórica correta.
