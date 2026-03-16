

## Optimizar Carregamento da Fase 3 — Diagnóstico e Plano

### Problema
O `list_sync_clients` faz **duas paginações completas da API Bitrix24** a cada chamada:
1. `crm.deal.list` — carrega TODOS os deals (50 por página)
2. `crm.contact.list` — carrega TODOS os contactos (50 por página)

Para um CRM com 2000 deals e 3000 contactos, isso significa ~100 chamadas HTTP sequenciais ao Bitrix24 **cada vez que o utilizador clica "Carregar Clientes"**, resultando em 30-60+ segundos de espera (e possível timeout da Edge Function a 60s).

### Solução: Cache Bitrix24 no Backend

Guardar os dados do Bitrix (deals e contactos) numa tabela de cache local, e apenas refrescar quando necessário.

### Alterações

#### 1. Nova tabela `bitrix24_sync_cache`
```sql
CREATE TABLE public.bitrix24_sync_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  cache_type text NOT NULL, -- 'deals' | 'contacts'
  data jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, cache_type)
);
ALTER TABLE public.bitrix24_sync_cache ENABLE ROW LEVEL SECURITY;
-- Service role only
CREATE POLICY "Service role full access" ON public.bitrix24_sync_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### 2. Backend (`import-access-data/index.ts`) — `list_sync_clients`

**a) Cache-first para dados Bitrix:**
- Antes de chamar a API Bitrix, verificar se existe cache com `fetched_at` < 30 minutos
- Se existir cache válido, usar os dados do cache (instantâneo)
- Se não existir ou expirado, fazer o fetch completo e guardar no cache
- Adicionar parâmetro `force_refresh=true` para forçar recarga

**b) Filtrar clientes já sincronizados no backend:**
- Clientes com `synced=true` continuam na resposta mas são excluídos do matching Bitrix (poupando processamento)
- Isto reduz o dataset a processar

**c) Progresso parcial via streaming (opcional, fase 2):**
- Responder primeiro com dados do Supabase (rápido, ~2s)
- Depois carregar Bitrix em background

#### 3. Frontend (`Bitrix24App.tsx`)

**a) Indicador de progresso mais detalhado:**
- Mostrar "A carregar clientes do banco de dados..." → "A carregar dados do Bitrix24..." → "A fazer correspondência..."
- Usar SSE ou polling para estados intermédios

**b) Botão "Forçar actualização Bitrix":**
- Por defeito usa cache (carrega em ~3s)
- Botão secundário para forçar refresh do cache quando necessário

### Impacto Esperado
- **1ª carga** (sem cache): mesma velocidade actual (~30-60s), mas guarda cache
- **Cargas seguintes** (com cache): **2-5 segundos** em vez de 30-60s
- **Após refresh de página**: usa cache, retoma instantaneamente

### Ficheiros a Alterar
1. **Migração SQL** — criar tabela `bitrix24_sync_cache`
2. **`supabase/functions/import-access-data/index.ts`** — lógica cache-first nos Steps 5-6
3. **`src/pages/Bitrix24App.tsx`** — UI com indicador de progresso e botão de refresh

