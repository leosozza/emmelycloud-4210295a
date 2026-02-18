

# Adicionar Blocos Bitrix24 CRM ao Editor de Fluxos

## Objetivo
Adicionar uma nova categoria **"Bitrix24"** na paleta do editor de fluxos com blocos para operacoes CRUD em **Lead**, **Deal** e **SPA** (Smart Process Automation) do Bitrix24.

## Novos Tipos de No

| Tipo | Label | Descricao |
|------|-------|-----------|
| `bitrix_create_lead` | Criar Lead | Criar um novo lead no Bitrix24 |
| `bitrix_update_lead` | Atualizar Lead | Atualizar campos de um lead existente |
| `bitrix_get_lead` | Buscar Lead | Obter dados de um lead por ID |
| `bitrix_delete_lead` | Excluir Lead | Excluir um lead do Bitrix24 |
| `bitrix_create_deal` | Criar Deal | Criar um novo negocio no Bitrix24 |
| `bitrix_update_deal` | Atualizar Deal | Atualizar campos de um deal existente |
| `bitrix_get_deal` | Buscar Deal | Obter dados de um deal por ID |
| `bitrix_delete_deal` | Excluir Deal | Excluir um deal do Bitrix24 |
| `bitrix_create_spa` | Criar SPA | Criar item em Smart Process Automation |
| `bitrix_update_spa` | Atualizar SPA | Atualizar item SPA existente |
| `bitrix_get_spa` | Buscar SPA | Obter dados de um item SPA |
| `bitrix_delete_spa` | Excluir SPA | Excluir item SPA do Bitrix24 |

## Interface de Dados (FlowBitrixCRM)

Cada no Bitrix tera a seguinte configuracao:

```text
entity: "lead" | "deal" | "spa"
operation: "create" | "update" | "get" | "delete"
entityId: string          -- ID da entidade (para get/update/delete), suporta {{variavel}}
spaEntityTypeId: string   -- ID do tipo SPA (apenas para SPA)
fields: array de { key, value }  -- Campos para create/update
resultVar: string         -- Nome da variavel para guardar o resultado
pipeline: string          -- Pipeline/categoria (opcional)
stageId: string           -- Estagio/status (opcional)
```

## Alteracoes por Ficheiro

### 1. `src/components/flows/FlowNodeTypes.ts`
- Adicionar 12 novos tipos ao union `FlowNodeType`
- Adicionar categoria "Bitrix24" ao `NODE_CATEGORIES`
- Adicionar metadata (icone, cor, descricao) para cada tipo no `NODE_TYPE_META`
  - Cor base: `#22c55e` (verde Bitrix) com variacoes por entidade
  - Icones: `Building2` (lead), `Handshake` (deal), `Boxes` (SPA), combinados com `Plus`, `Pencil`, `Search`, `Trash2`
- Adicionar interface `FlowBitrixCRM` com os campos acima
- Adicionar `bitrixCrm?: FlowBitrixCRM` ao `FlowNodeData`
- Adicionar defaults no `getDefaultData()` para cada tipo Bitrix

### 2. `src/components/flows/NodeConfigPanel.tsx`
- Adicionar secao de configuracao para nos Bitrix (quando `nodeType` comeca com `bitrix_`)
- Campos do painel:
  - **ID da Entidade** (para get/update/delete): Input com placeholder `{{lead_id}}`
  - **ID do Tipo SPA** (apenas para SPA): Input numerico
  - **Pipeline / Categoria**: Input opcional
  - **Estagio**: Input opcional
  - **Campos (fields)**: Lista dinamica de pares chave/valor com add/remove
    - Chave: Input (ex: `TITLE`, `NAME`, `PHONE`)
    - Valor: Input (ex: `{{nome_cliente}}`, texto fixo)
  - **Variavel de resultado**: Input para guardar resposta da API
- Dica com campos comuns do Bitrix24 (TITLE, NAME, PHONE, EMAIL, COMPANY_TITLE, OPPORTUNITY, STAGE_ID)

### 3. `src/components/flows/CustomFlowNode.tsx`
- Adicionar preview para nos Bitrix:
  - Mostrar operacao + entidade (ex: "Criar Lead")
  - Mostrar numero de campos configurados
  - Mostrar ID da entidade se definido
  - Mostrar variavel de resultado se definida

### 4. `src/components/flows/FlowNodePalette.tsx`
- Nenhuma alteracao necessaria (ja renderiza automaticamente baseado em `NODE_CATEGORIES`)

