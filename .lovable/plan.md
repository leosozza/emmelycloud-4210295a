

## Plano: Corrigir carregamento de Pipelines/Etapas e Mapeamento de Campos

### Problemas Identificados

1. **Edge functions não estavam deployed** — `bitrix24-fetch-entities` e `bitrix24-fields` não estavam publicadas. Já foram deployed agora.

2. **BaixaCarteiraView não carrega pipelines automaticamente** — Quando o utilizador abre a vista "Baixa Carteira", não existe `useEffect` para carregar os pipelines ao montar o componente. O utilizador tem de mudar manualmente o tipo de entidade para disparar a busca.

3. **FieldMappingManager não busca campos do Bitrix24** — O componente chama `bitrix24-fields` com o token de autenticação do Supabase, mas dentro do iframe do Bitrix24 não existe sessão Supabase ativa. O `bitrix24-fields` usa `connector_active` para encontrar a integração, mas sem autenticação válida a chamada falha silenciosamente.

4. **Mapeamentos automáticos não são criados** — Na instalação, os campos UF_CRM_EMMELY_* são criados no Bitrix24 mas o sistema não insere os mapeamentos correspondentes na tabela `bitrix24_field_mappings`.

### Correções

#### 1. `src/pages/Bitrix24App.tsx` — Auto-load pipelines no mount

Adicionar `useEffect` na `BaixaCarteiraView` para chamar `handleEntityChange("deal")` quando o componente monta e a integração está disponível.

```typescript
useEffect(() => {
  if (integration?.member_id) {
    handleEntityChange("deal");
  }
}, [integration?.member_id]);
```

#### 2. `src/components/bitrix24/FieldMappingManager.tsx` — Usar anon key quando não há sessão

O `fetchBitrixFields` já constrói o header com fallback para `SUPABASE_KEY`, mas pode falhar se a edge function exigir auth. Ajustar para sempre usar a anon key no contexto iframe.

#### 3. `supabase/functions/bitrix24-fields/index.ts` — Aceitar `member_id` como parâmetro

Atualmente a function busca a primeira integração ativa (`connector_active = true`). Adicionar suporte a `member_id` como query param para ser consistente com as outras functions do Bitrix24.

#### 4. `supabase/functions/bitrix24-install/index.ts` — Criar mapeamentos automáticos

Após criar os campos UF_CRM_EMMELY_*, inserir automaticamente registos na tabela `bitrix24_field_mappings` para cada campo criado, vinculando-os às colunas relevantes da tabela `payment_transactions`.

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `src/pages/Bitrix24App.tsx` | Adicionar useEffect para auto-load de pipelines na BaixaCarteiraView |
| `src/components/bitrix24/FieldMappingManager.tsx` | Passar member_id para bitrix24-fields |
| `supabase/functions/bitrix24-fields/index.ts` | Aceitar member_id param + disable JWT verification |
| `supabase/functions/bitrix24-install/index.ts` | Auto-seed field mappings após criar userfields |

