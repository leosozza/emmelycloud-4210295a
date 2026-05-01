
## Problema identificado

O CSV anterior trouxe muitos campos sem nome amigável porque o script só leu `EDIT_FORM_LABEL["pt-BR"]`. No Bitrix24, o título do campo pode estar em vários lugares dependendo do idioma da conta e de como o campo foi criado (manual, via API, importado, etc).

## Plano: regerar `bitrix_campos_auditoria_v2.csv`

### 1. Buscar metadados completos via DOIS endpoints (combinados)

Para cada entidade (Lead e Deal), chamar em paralelo:

- **`crm.lead.fields` / `crm.deal.fields`** → traz `formLabel`, `title`, `listLabel`, `filterLabel` já normalizados pelo Bitrix
- **`userfield.list`** com `FILTER: { ENTITY_ID: "CRM_LEAD" }` e `CRM_DEAL` → traz o objeto bruto com TODAS as labels multi-idioma:
  - `EDIT_FORM_LABEL` (objeto: `{ pt-BR, en, ru, br, de, ... }`)
  - `LIST_COLUMN_LABEL`
  - `LIST_FILTER_LABEL`
  - `SEARCH_LABEL`
  - `HELP_MESSAGE`
  - `ERROR_MESSAGE`

### 2. Resolver o nome amigável com cascata robusta

Para cada campo, percorrer nesta ordem até encontrar string não-vazia:

```
1. crm.*.fields → formLabel
2. crm.*.fields → title
3. crm.*.fields → listLabel
4. userfield → EDIT_FORM_LABEL[pt-BR]
5. userfield → EDIT_FORM_LABEL[br]
6. userfield → EDIT_FORM_LABEL[en]
7. userfield → EDIT_FORM_LABEL[*qualquer idioma com valor*]
8. userfield → LIST_COLUMN_LABEL[*qualquer idioma*]
9. userfield → LIST_FILTER_LABEL[*qualquer idioma*]
10. userfield → SEARCH_LABEL[*qualquer idioma*]
11. userfield → HELP_MESSAGE[*qualquer idioma*]
12. (vazio) → marcar como "SEM NOME"
```

### 3. Amostragem de dados reais (para campos sem nome)

Para os campos que mesmo após cascata ficarem "SEM NOME", buscar até **3 valores reais distintos** dos últimos 2.000 registros, para você conseguir identificar pelo conteúdo o que o campo significa. Ex.: se a amostra mostra "OAB/SP 123456", você sabe que é registro OAB.

Para campos do tipo `enumeration` (lista), trazer também os **labels das opções** (ITEMS), pois muitas vezes as opções têm nome mesmo quando o campo não tem.

### 4. Cálculo de uso

Reaproveitar a lógica anterior (chunks de 15-20 campos, retry com backoff) sobre os 2.000 leads + 2.000 deals mais recentes. Para cada campo:
- `usage_pct` = % de registros com valor não-nulo/não-vazio
- `last_used_at` = data mais recente onde o campo foi preenchido

### 5. Saída — `bitrix_campos_auditoria_v2.csv`

Colunas:

| Coluna | Descrição |
|---|---|
| `entity` | LEAD ou DEAL |
| `field_id` | UF_CRM_xxx |
| `friendly_name` | Nome resolvido pela cascata |
| `name_source` | Qual passo da cascata resolveu (ex: "EDIT_FORM_LABEL[en]") — para auditoria |
| `type` | string, enumeration, money, date, etc |
| `is_required` | Y/N |
| `usage_pct` | 0.0% – 100.0% |
| `last_used_at` | ISO date |
| `sample_values` | até 3 valores reais (separados por ` \| `) |
| `enum_options` | labels das opções para campos lista |
| `recommendation` | 🔴 APAGAR / 🟡 AVALIAR / 🟢 MANTER |
| `protected` | Y se for `UF_CRM_EMMELY_*` ou usado por Edge Functions |

### 6. Critério de recomendação (refinado)

- 🟢 **MANTER** — uso > 0% **OU** prefixo protegido (`UF_CRM_EMMELY_*`, `UF_CRM_OPENLINE_*`, etc) **OU** referenciado em Edge Functions do projeto
- 🟡 **AVALIAR** — uso = 0% **MAS** tem nome amigável real (você decide se ainda faz sentido manter)
- 🔴 **APAGAR** — uso = 0% **E** sem nome amigável em nenhum idioma **E** sem amostras úteis

### 7. Entrega

1. CSV em `/mnt/documents/bitrix_campos_auditoria_v2.csv` com `<lov-artifact>`
2. Resumo no chat: contagem por categoria, lista dos 10 campos mais ambíguos com amostras, e as 3 opções de cleanup (auto-apagar / revisão manual / construir tela na app)

## Arquivos técnicos (apenas execução, nada permanente no codebase)

- Scripts Python temporários em `/tmp/` usando o token do `bitrix24_integrations` (lido via `psql`)
- Sem alterações em arquivos do projeto, sem novas Edge Functions, sem migrações

## Confirme antes de executar

Quer que eu prossiga com essa reauditoria com cascata multi-idioma e amostragem de valores reais?
