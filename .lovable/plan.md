

## Plano: Clarificar Status de Sincronização na Fase 3

### Problema
Os números são confusos porque:
1. O campo `synced` **não existe no backend** — é apenas estado do frontend/sessionStorage. Se recarregar a página ou limpar cache, perde-se a informação de quem já foi sincronizado.
2. A lista não usa os **IDs locais do banco de dados** (`clients.bitrix24_id`, `financial_records.bitrix24_deal_id`) para determinar quem já está sincronizado. Um cliente com `bitrix24_id` preenchido e deals com `bitrix24_deal_id` preenchido **já está sincronizado**, mas a lista não reflecte isso.
3. Não há um resumo claro e visível de "X sincronizados / Y pendentes" baseado em dados reais (DB), apenas em estado volátil.

### Solução

**A. Backend (`import-access-data/index.ts` — `list_sync_clients`)**

Na Step 6 (match + build `clientsList`), adicionar lógica para marcar `synced: true` quando o cliente já tem dados no banco local:
- Se `client.bitrix24_id` existe (contacto já no Bitrix) **E** pelo menos um `financial_record` tem `bitrix24_deal_id` preenchido → `synced: true`
- Caso contrário → `synced: false`

Isto significa que ao carregar a lista, o sistema já sabe imediatamente quem está sincronizado com base em dados persistentes, não em estado de sessão.

Dados necessários já disponíveis:
- `client.bitrix24_id` — já no SELECT (linha 504)
- `bitrix24_deal_id` — já no SELECT dos financial_records (linha 546)

**B. Frontend (`Bitrix24App.tsx`)**

1. **Painel de resumo melhorado** (substituir as 2 badges actuais por um painel com 4 KPIs):
   - Total de clientes importados
   - Sincronizados (com contacto + deal no Bitrix) — verde
   - Parcialmente sincronizados (só contacto ou só deal) — amarelo  
   - Pendentes (nenhum vínculo) — vermelho
   
2. **Coluna "Status" na tabela** — substituir a coluna "Bitrix" actual por uma coluna mais clara:
   - ✅ "Sincronizado" (verde) — tem contacto + deal
   - ⚠️ "Parcial" (amarelo) — tem contacto mas sem deal, ou vice-versa
   - ⏳ "Pendente" (outline) — nenhum vínculo

3. **Filtro por status de sync** — adicionar botões "Sincronizados / Pendentes / Todos" acima da tabela para filtrar rapidamente.

4. **Nota sobre limpeza** — quando 100% sincronizados, mostrar mensagem: "Todos os clientes estão sincronizados com o Bitrix24. As tabelas de importação podem ser removidas com segurança."

### Ficheiros a editar
- `supabase/functions/import-access-data/index.ts` — adicionar `synced` baseado em IDs locais do DB
- `src/pages/Bitrix24App.tsx` — melhorar UI com KPIs, filtros e indicadores claros

### Resultado
- A informação de sincronização é **persistente e fiável** (baseada no DB, não em sessão)
- O utilizador vê claramente quantos faltam sincronizar
- Quando tudo estiver sincronizado, sabe que pode limpar as tabelas de importação

