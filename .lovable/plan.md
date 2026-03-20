

# Melhoria do Sistema de Orçamento via Robot Bitrix24

## Situação Atual
O robot `emmely_generate_proposal` já existe e gera propostas a partir de deals/leads, mas não suporta:
- Seleção de **template** (modelos da tabela `proposal_templates`)
- Adição de **produtos** (da tabela `services`)
- Envio automático do resultado (link ou PDF) via WhatsApp/chat

## Plano de Implementação

### 1. Atualizar o Robot com novos parâmetros
**Ficheiro:** `supabase/functions/bitrix24-install/index.ts`

Adicionar ao robot `emmely_generate_proposal`:
- `template_id` (select) — lista de modelos disponíveis ou nome do template
- `product_ids` (string) — IDs dos produtos/serviços separados por vírgula
- `send_method` (select) — "link", "pdf", "both", "none"
- `send_to_phone` (string) — telefone para envio via WhatsApp

### 2. Atualizar o Handler do Robot
**Ficheiro:** `supabase/functions/bitrix24-robot-handler/index.ts`

Na função `handleGenerateProposal`:
- Se `template_id` ou `template_name` for informado, buscar o template em `proposal_templates` e preencher automaticamente: título, descrição, condições, tipo de pagamento, parcelas e valor base
- Se `product_ids` for informado, buscar os serviços na tabela `services`, somar valores e concatenar descrições
- Os valores manuais (se informados) sobrepõem os do template
- Após criar a proposta, se `send_method` = "link" ou "both", enviar mensagem WhatsApp com o link de aceite
- Se `send_method` = "pdf" ou "both", gerar o PDF e enviar como media via WhatsApp
- Devolver novos parâmetros: `template_used`, `products_used`, `send_status`

### 3. Reinstalar Robots
Após a edição, reimplantar a Edge Function `bitrix24-install` para que os novos parâmetros apareçam no Bitrix24 ao reinstalar/reparar a integração.

### Fluxo Final no Bitrix24
```text
Deal chega na etapa X
  → Automação BizProc aciona robot "Emmely: Gerar Proposta"
  → Utilizador configura:
      - Template: "Consultoria Jurídica"
      - Produtos: "Serviço A, Serviço B"
      - Pagamento: Parcelado, 3x
      - Envio: Link + PDF
  → Robot gera proposta com dados do deal + template + produtos
  → Envia link com botão de aceite e/ou PDF ao cliente via WhatsApp
  → Devolve proposal_url, pdf_url ao BizProc
```

### Ficheiros a Editar
1. `supabase/functions/bitrix24-robot-handler/index.ts` — lógica do handler
2. `supabase/functions/bitrix24-install/index.ts` — registo do robot com novos campos

