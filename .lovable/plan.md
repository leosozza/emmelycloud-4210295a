

## Análise Completa: Problemas Encontrados

Após análise detalhada dos logs, código e dados, identifiquei **5 problemas críticos** que explicam por que nada funciona:

### Problema 1: Campos NÃO foram atualizados no Bitrix24
O log da última instalação (13:03) mostra `userfields_registered: []` — **zero campos criados**. Isto porque os campos já existiam da instalação anterior (12:22) com labels em inglês e tipo `integer`. A API do Bitrix24 retorna "already exists" e o sistema ignora. **Não existe mecanismo para apagar e recriar campos.**

### Problema 2: Função `ensureTxExists` NUNCA FOI DEFINIDA
Na linha 820 do payment-tab, `submitBaixa` chama `ensureTxExists(txId, ...)` — mas esta função **não existe em lado nenhum do ficheiro**. Qualquer tentativa de dar baixa numa parcela sintética causa erro JavaScript imediato.

### Problema 3: `submitEdit` não trata parcelas sintéticas
O `submitEdit` (linha 714) envia diretamente um PATCH com o `txId`. Para parcelas sintéticas (ID `deal-XXX`), o `payment-create` PATCH falha porque não existe transação com esse ID. Falta chamar `ensureTxExists` antes.

### Problema 4: `submitBaixa` tem erro de sintaxe
Linhas 817-822: existe um `try {` a abrir seguido de outro `try {` sem fechar o primeiro. O bloco try/catch está mal estruturado, o que pode causar comportamento imprevisível.

### Problema 5: Ícone do conector ainda vermelho
Na linha 260 do install, o ícone SVG do conector usa `fill="#722F37"` (vermelho bordeaux). Não foi atualizado para azul.

---

## Plano de Correção

### Ficheiro 1: `supabase/functions/bitrix24-install/index.ts`

1. **Adicionar ação `repair_fields`** acessível via query param `?action=repair_fields`:
   - Lista campos existentes via `crm.deal.userfield.list` com filtro `FIELD_NAME LIKE UF_CRM_EMMELY%`
   - **Apaga cada campo** via `crm.deal.userfield.delete` (e `crm.lead.userfield.delete`)
   - Recria todos os 11 campos com labels PT e tipos corretos
   - Retorna relatório JSON: `{ deleted: [...], created: [...], errors: [...] }`

2. **Mudar cor do ícone do conector** de `#722F37` para `#2067b0` (azul Bitrix24) nas linhas do SVG e BORDER

### Ficheiro 2: `supabase/functions/bitrix24-payment-tab/index.ts`

1. **Definir a função `ensureTxExists`** no bloco `<script>`:
   - Se `txId` começa com `deal-`: faz POST a `payment-create` para criar transação real com os dados da parcela
   - Retorna o novo `txId` real
   - Se `txId` não é sintético: retorna como está

2. **Adicionar `ensureTxExists` ao `submitEdit`**: antes do PATCH, chamar `ensureTxExists` para garantir que a transação existe

3. **Corrigir try/catch de `submitBaixa`**: remover o `try {` duplicado nas linhas 817-822, alinhar corretamente o bloco

4. **Adicionar `entity_id` ao dataset do `edit-overlay`**: para que `ensureTxExists` tenha acesso ao entityId também na edição

### Ficheiros a Modificar

| Ficheiro | Alterações |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Ação `repair_fields` (delete+recreate); cor do ícone azul |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Definir `ensureTxExists`; usá-la em `submitEdit` e `submitBaixa`; corrigir try/catch |

### Após Implementação
O utilizador deve chamar manualmente o endpoint `bitrix24-install?action=repair_fields` (ou reinstalar a app) para que os campos sejam apagados e recriados com os nomes corretos em PT.

