

# Modelos de Orçamento — Templates com Variáveis (em vez de 24 duplicados)

## Análise

Os 24 PDFs do Bitrix24 partilham a mesma estrutura visual:
- Header (Emmely Fernandes Advocacia)
- Dados do Cliente (nome, documento, morada)
- Descrição do serviço
- Valor / Condições de pagamento
- Condições gerais
- Footer

O que varia entre eles é apenas: **nome do serviço**, **descrição específica** e **valor**. Como já existem ~60 serviços na tabela `services` com nomes e valores, não faz sentido criar 24 templates quase idênticos.

## Plano

### 1. Criar 5 templates por categoria (em vez de 24)

Agrupar por tipo de serviço, cada um com a descrição genérica da categoria e variáveis que serão preenchidas automaticamente pelo robot:

| Template | Categoria | Serviços cobertos |
|----------|-----------|-------------------|
| Ação Judicial | Judicial | Todas as ações judiciais (~12 serviços) |
| Assessoria / Acompanhamento | Imigração | Assessorias, acompanhamentos, ARs (~15 serviços) |
| Nacionalidade | Nacionalidade | Atribuição, aquisição, renúncia (~8 serviços) |
| Serviços Administrativos | Fiscal/Civil | NIF, morada, casamento, viagem, carta convite (~6 serviços) |
| Consulta | Consulta | Presencial, online (~2 serviços) |

### 2. Variáveis nos templates

Cada template usará placeholders que o motor de PDF já resolve:
- `{{service_name}}` — nome do serviço (vem da tabela `services` ou do título da proposta)
- `{{client_name}}`, `{{client_email}}`, etc. — dados do cliente (já funcionam)
- `{{value}}`, `{{payment_type}}`, `{{installments}}` — valores (já funcionam)

A **description** do template será o texto genérico da categoria, e o robot substitui com a description do serviço se existir.

### 3. Implementação

**Migração SQL** — Inserir 5 registos em `proposal_templates`:
- `name`: Nome da categoria
- `template_type`: `'proposta'`
- `company_name`: `'Emmely Fernandes'`
- `company_tagline`: `'Advocacia Internacional'`
- `header_color`: `'#1e293b'`
- `accent_color`: `'#0f172a'`
- `description`: Texto genérico da categoria com placeholders
- `conditions`: Condições padrão (prazo de validade, formas de pagamento, etc.)
- `layout_blocks`: Blocos padrão (header, client_info, description, payment, conditions, footer)

**Sem alteração de código** — A página de propostas e o robot `emmely_generate_proposal` já listam e usam templates da tabela. Os 5 modelos aparecem automaticamente.

### Ficheiros
- **Migração SQL** (novo) — seed de 5 templates categorizados em `proposal_templates`

