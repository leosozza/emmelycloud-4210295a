

## Plano: Corrigir importação usando tabelas originais do Access

### Problemas encontrados

Comparando as tabelas originais (TBL_CLIENTE.xlsx com 1081 registos, TBL_HONORARIOS.xlsx com 5732 parcelas) com o JSON do Manus, identifiquei:

1. **Agrupamento errado**: O código actual agrupa honorários por texto da `DESCRICAO`. As tabelas originais têm `SEPARADORID` que agrupa correctamente as parcelas do mesmo serviço. Um cliente pode ter 2 serviços com a mesma descrição "ESTUDO" mas SEPARADORID diferentes.

2. **Valores incorrectos**: O código usa `VALOR_PARCELA` mas ignora:
   - `VALOR_PARCELA_CORRIGIDO` — valor ajustado (ex: parcela com encargos de atraso)
   - `TOTALPAGO` — valor efectivamente pago (pode ser diferente do valor da parcela)
   - `ENCARGOS_ATRASO`, `JUROS`, `MULTA` — encargos adicionais

3. **Campos de cliente em falta**: As tabelas originais têm `FREGUESIA`, `CONSELHO`, `DISTRITO`, `ESTADOCIVIL`, `NIB` que não estão a ser importados.

4. **Status ATRASADO**: O JSON do Manus pode ter convertido `ATRASADO` para `PENDENTE`, perdendo a distinção.

### Exemplo concreto do problema de valores

```text
Honorário ID 5725 (linha 4725):
  VALOR_PARCELA = 100.00
  VALOR_PARCELA_CORRIGIDO = 110.20  ← com encargos
  TOTALPAGO = 100.00                ← pagou só o original
  ENCARGOS_ATRASO = 10.20

Honorário ID 5780 (linha 4722):
  VALOR_PARCELA = 300.00
  VALOR_PARCELA_CORRIGIDO = 300.00
  TOTALPAGO = 150.00                ← pagou metade (PARCIAL)
```

### Solução

Actualizar a Edge Function `import-access-data` para aceitar as tabelas em formato raw (2 arrays: clientes + honorarios) e usar os campos correctos:

**1. Novo formato de input:**
```json
{
  "clientes": [{ "ID": 4, "NOME": "...", "NIFNIPC": "...", ... }],
  "honorarios": [{ "ID": 57, "SEPARADORID": 4, "CLIENTE": 4, ... }],
  "member_id": "...",
  "sync_bitrix": true
}
```

**2. Agrupamento por SEPARADORID** (em vez de DESCRICAO):
- Todas as parcelas com o mesmo SEPARADORID pertencem ao mesmo serviço/contrato
- O Deal no Bitrix24 usa o SEPARADORID para o campo `UF_CRM_1768312831`

**3. Valores correctos:**
- `installment_value` ← `VALOR_PARCELA_CORRIGIDO || VALOR_PARCELA`
- `total_paid` no Deal ← soma de `TOTALPAGO` das parcelas
- Status: `QUITADO` → pago, `PENDENTE` → pendente, `ATRASADO` → atrasado, `PARCIAL` → parcial

**4. Campos de cliente adicionais:**
- `freguesia`, `concelho`, `distrito` → tabela `clients` (já tem estas colunas)
- `nib` → `clients.nib`
- `estado_civil` → `clients.notes` (não existe coluna dedicada)

**5. Frontend**: Actualizar o componente de importação para aceitar 2 ficheiros Excel (TBL_CLIENTE + TBL_HONORARIOS) e fazer o parse com uma lib XLSX no browser antes de enviar à edge function.

### Ficheiros a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/import-access-data/index.ts` | Reescrever para aceitar formato raw com SEPARADORID + valores corrigidos |
| `src/pages/Bitrix24App.tsx` | Actualizar upload para 2 ficheiros Excel + parse XLSX |
| `package.json` | Adicionar dependência `xlsx` para parse no browser |

### Mapeamento corrigido

```text
TBL_HONORARIOS                    →  Emmely                    →  Bitrix24
──────────────────────────────────────────────────────────────────────────────
SEPARADORID                       →  (agrupa parcelas)          →  UF_CRM_1768312831
VALOR                             →  total_value                →  Deal OPPORTUNITY
VALOR_PARCELA_CORRIGIDO > 0       →  installment_value          →  Invoice opportunity
  senão VALOR_PARCELA             →                             →
TOTALPAGO                         →  (validação de pago)        →  Invoice paid amount
ENCARGOS_ATRASO                   →  notes                      →  (info)
STATUS = ATRASADO                 →  status = atrasado          →  Invoice stage OVERDUE
STATUS = PARCIAL                  →  status = parcial           →  Invoice stage PARTIAL
```

