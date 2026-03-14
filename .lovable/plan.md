

## Plano: Corrigir importação — usar CLIENTE (id_access) em vez de SEPARADORID como chave principal

### Problema actual

Na Fase 2 (Honorários), o sistema agrupa as parcelas por `SEPARADORID` e cria **um Deal separado por cada SEPARADORID**. Isto está errado porque:

- **Coluna A** de TBL_Clientes = `ID` (id_access do cliente)
- **Coluna E** da tabela de Honorários = `CLIENTE` = o mesmo id_access
- O campo `UF_CRM_1768312831` no Bitrix24 guarda o id_access

O comportamento correcto é: **1 Deal por cliente** (o que já foi criado na Fase 1), e os honorários devem **actualizar esse Deal existente** com os valores financeiros agregados.

### Alterações

**Ficheiro: `supabase/functions/import-access-data/index.ts`**

1. **Manter o agrupamento local por SEPARADORID** para criar leads, cases, proposals e financial_records no Supabase (cada serviço continua a ser registado separadamente na base de dados local).

2. **Refactorizar `syncHonorariosToBitrix`** — em vez de criar/procurar deals por `SEPARADORID + TITLE`, a função deve:
   - Procurar o Deal existente por `UF_CRM_1768312831 = client.ID` (id_access) — sem filtro de título
   - Se encontrar **um** deal, actualizá-lo com os totais **agregados** de todos os honorários desse cliente (soma de valores, soma de pagos, status geral)
   - Se não encontrar, criar um único Deal com o id_access e os totais
   - Criar Smart Invoices (Type 31) vinculadas a esse Deal único

3. **Mudar a chamada de `syncHonorariosToBitrix` no loop de SEPARADORID** — em vez de chamar por cada grupo SEPARADORID, chamar **uma vez por cliente** com todos os honorários agregados, após o loop de grupos.

4. **Actualizar o Deal com dados consolidados**:
   - `OPPORTUNITY` = soma de todos os valores de serviços do cliente
   - `STAGE_ID` = `WON` só se todos os honorários estiverem quitados
   - Manter `UF_CRM_1768312831 = id_access`
   - Smart Invoices criadas por cada parcela individual

### Fluxo corrigido

```text
Fase 1: TBL_Clientes
  Col A (ID) = id_access
  → Supabase: upsert client
  → Bitrix: Contact + Deal vazio (UF_CRM_1768312831 = id_access)

Fase 2: Honorários
  Col E (CLIENTE) = id_access → vincula ao cliente
  → Supabase: lead + case + proposal + financial_records (por SEPARADORID)
  → Bitrix: busca Deal por UF_CRM_1768312831 = id_access
            actualiza com totais agregados
            cria Smart Invoices vinculadas a esse Deal
```

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/import-access-data/index.ts` | Refactorizar sync Bitrix: 1 Deal por cliente (id_access), agregar todos os honorários antes de sincronizar |

