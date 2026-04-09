

# Melhorar Robot "Gerar Proposta" + Salvar Links no Bitrix24

## Problemas identificados

1. **Template**: O campo `template_name` é texto livre — o utilizador tem que digitar o nome exacto. Robots do Bitrix24 **não suportam listas dinâmicas** (apenas `select` com opções fixas). A solução é carregar os templates da BD no momento do install/repair e registar as opções no robot.

2. **Produtos**: O campo `product_ids` exige UUIDs manuais. O robot deve suportar carregar automaticamente os produtos vinculados ao deal no Bitrix24 (`crm.deal.productrows.list`).

3. **Salvar no Bitrix24**: Após gerar a proposta, o robot **não escreve** `proposal_url` nem `pdf_url` de volta no deal. Precisamos de 2 novos campos UF e a lógica de update.

## Alterações

### 1. Novos campos UF no Bitrix24 (`bitrix24-install/index.ts`)

Criar 2 campos `url` no install e repair_fields:
- `UF_CRM_EMMELY_PROPOSAL_URL` — LINK DA PROPOSTA (SORT: 0)
- `UF_CRM_EMMELY_PROPOSAL_PDF` — PDF DA PROPOSTA (SORT: 0)

### 2. Template como select dinâmico (`bitrix24-install/index.ts`)

No momento do registo dos robots, carregar os templates tipo `proposta` da tabela `proposal_templates` e construir o objecto `Options` dinamicamente:

```
// Carregar templates
const { data: templates } = await supabase.from("proposal_templates")
  .select("id, name").eq("template_type", "proposta");

const templateOptions = {};
templates?.forEach(t => { templateOptions[t.id] = t.name; });

// No robot PROPERTIES:
template_name: { Type: "select", Options: templateOptions }
```

Assim o utilizador vê um dropdown com os nomes dos templates.

### 3. Produtos do Deal Bitrix24 (`bitrix24-robot-handler/index.ts`)

Quando `product_ids` estiver vazio, carregar automaticamente os produtos do deal via `crm.deal.productrows.list` e usar os nomes/valores como descrição da proposta.

### 4. Salvar links no deal após gerar (`bitrix24-robot-handler/index.ts`)

Após a linha 746 (depois de gerar e enviar), adicionar `crm.deal.update` para salvar:
- `UF_CRM_EMMELY_PROPOSAL_URL` = proposalUrl
- `UF_CRM_EMMELY_PROPOSAL_PDF` = pdfUrl

```typescript
// Save proposal URLs to Bitrix24 deal
if (entityType === "deal" && entityId) {
  await callBitrix(ep, tk, "crm.deal.update", {
    ID: entityId,
    fields: {
      UF_CRM_EMMELY_PROPOSAL_URL: proposalUrl,
      UF_CRM_EMMELY_PROPOSAL_PDF: pdfUrl || "",
    }
  });
}
```

## Ficheiros a editar

1. **`supabase/functions/bitrix24-install/index.ts`** — novos campos UF_CRM_EMMELY_PROPOSAL_URL/PDF + template_name como select dinâmico
2. **`supabase/functions/bitrix24-robot-handler/index.ts`** — carregar produtos do deal + salvar links no Bitrix24 após gerar proposta

