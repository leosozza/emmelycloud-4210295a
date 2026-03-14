

## Plano: Redesign completo da Carteira — Vincular honorários, Deals Bitrix24 e botão "Atualizar Bitrix"

### Contexto actual

A cadeia de dados importados é:
`clients` → `leads` (client_id, sync_source=access_import) → `cases` (lead_id) → `contracts` (case_id) → `financial_records` (contract_id)

O Access ID do cliente está no campo `notes` da tabela `clients` e no campo `UF_CRM_1768312831` dos Deals no Bitrix24. Cada SEPARADORID do Access gera um lead separado (um cliente pode ter múltiplos leads/deals).

A `CarteiraAccessView` actual mostra apenas dados básicos do cliente sem vínculos financeiros nem integração com Bitrix24.

### Solução

Reescrever `CarteiraAccessView` para mostrar o panorama completo de cada cliente com os seus serviços, parcelas e Deals do Bitrix24.

### Alterações em `src/pages/Bitrix24App.tsx` — `CarteiraAccessView`

**1. Buscar dados completos (não apenas clients)**
- Query: `clients` com `notes ILIKE '%Access%'`
- Para cada cliente, fazer JOIN via REST: buscar `leads` com `client_id` e `sync_source=access_import`, depois `cases`, `contracts`, `financial_records`
- Usar uma única query com select encadeado: `leads?client_id=eq.{id}&sync_source=eq.access_import&select=id,name,notes,cases(id,title,contracts(id,status,financial_records(id,description,installment_number,total_installments,installment_value,total_value,status,due_date,paid_at)))`

**2. Tabela principal — uma linha por cliente**
- Colunas: Nome | Documento | Serviços (count de leads) | Valor Total | Pago | Pendente | Em Atraso | Ações
- Valores calculados a partir dos `financial_records` de todos os contratos do cliente
- Badge colorido: verde se tudo pago, laranja se pendente, vermelho se atraso

**3. Expandir linha — detalhes por serviço (lead/deal)**
- Lista de cards, um por lead/caso:
  - Título do serviço (case.title), valor total, parcelas pagas/total
  - Tabela de parcelas (financial_records): nº, valor, vencimento, status, data pagamento
  - Badge de status por parcela (paga/pendente/atrasada)

**4. Botão "Atualizar Bitrix" por cliente**
- Ao clicar, abre modal/painel que:
  1. Busca Deals do Bitrix24 pelo Access ID via `bitrix24-fetch-entities` (filter `UF_CRM_1768312831 = accessId`)
  2. Para cada Deal encontrado mostra: título, contacto, produto/valor, gateway, parcelas, valor recebido, quitados/aberto/atraso, responsável
  3. Botão "Sincronizar" que chama `bitrix24-update-deal-payment` para atualizar UF fields e criar/atualizar Smart Invoices

**5. Clientes quitados sem Deal**
- Para clientes 100% quitados que não têm Deal no Bitrix24, mostrar opção "Criar Contacto" que usa `crm.contact.add` para registar os dados no CRM (sem criar Deal), para futuras referências

### Nova Edge Function: nenhuma necessária
- Usar `bitrix24-fetch-entities` existente (já suporta filter por UF fields via `crm.deal.list`)
- Usar `bitrix24-update-deal-payment` existente para sincronizar parcelas
- Para buscar responsável do Deal, adicionar `ASSIGNED_BY_ID` ao select na chamada Bitrix (feito no frontend ao chamar a API)

### Estrutura visual

```text
┌──────────────────────────────────────────────────────────────────┐
│ Carteira de Clientes    [🔍 Pesquisar]   [↻ Atualizar]          │
│ 45 clientes • €120.5k total • €95k pago • €15k pendente         │
├────────┬──────────┬─────────┬────────┬───────┬────────┬─────────┤
│ Nome   │Documento │Serviços │V.Total │ Pago  │Pendente│ Ações   │
│ Maria  │ 123...   │  2      │€3.000  │€2.000 │ €500   │[Bitrix] │
│  └─ [EXPANDIDO]                                                  │
│  ┌─ LEGALIZAÇÃO (€1.500)  3/3 pagas ✓                            │
│  │  1/3 €500 venc:01/22 ✅ pago:01/22                            │
│  │  2/3 €500 venc:02/22 ✅ pago:02/22                            │
│  │  3/3 €500 venc:03/22 ✅ pago:03/22                            │
│  ├─ REAGRUPAMENTO (€1.500)  2/3 pagas                            │
│  │  1/3 €500 venc:04/22 ✅ pago:04/22                            │
│  │  2/3 €500 venc:05/22 ✅ pago:05/22                            │
│  │  3/3 €500 venc:06/22 🔴 atrasada                              │
│ João   │ 678...   │  1      │€1.500  │€1.500 │  —     │[Bitrix] │
└────────┴──────────┴─────────┴────────┴───────┴────────┴─────────┘

Modal "Atualizar Bitrix" (cliente Maria):
┌────────────────────────────────────────────────────┐
│ Deals no Bitrix24 para Maria (Access ID: 42)       │
├─ Deal #142: LEGALIZAÇÃO - MARIA                    │
│  Contacto: Maria Silva (ID 55)                     │
│  Valor: €1.500 | Gateway: — | Parcelas: 3          │
│  Recebido: €1.500 | Quitados: 3 | Aberto: 0       │
│  Responsável: Admin (ID 1)                         │
│  [Sincronizar Parcelas]                            │
├─ Deal #143: REAGRUPAMENTO - MARIA                  │
│  ...                                               │
│ ─────────────────────────────────────────────────── │
│ ⚠ Sem Deal? [Criar apenas Contacto no Bitrix]      │
└────────────────────────────────────────────────────┘
```

### Ficheiro a modificar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Reescrever `CarteiraAccessView` com dados financeiros, tabela expandível por serviço, modal "Atualizar Bitrix" com fetch de Deals e sincronização |

