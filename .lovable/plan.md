

# Análise dos Robots de Propostas

## Resultado da Análise

### 1. Robot `emmely_generate_proposal` — Problemas encontrados

**Problema A: `template_id` não é passado à proposta**
Quando o robot encontra um template (`templateName`), ele extrai os dados (título, descrição, condições, valor, etc.) mas **nunca associa o `template_id`** à proposta criada. O `INSERT` na tabela `proposals` (linha 666-686) não inclui `template_id`. Consequência: o PDF gerado pela Edge Function `proposal-pdf` não consegue carregar o `layout_blocks` do template — cai sempre no layout fallback hardcoded.

**Problema B: Não lista templates disponíveis**
O parâmetro `template_name` no Bitrix24 é um campo `Type: "string"` livre. O utilizador precisa saber o nome exato do template. Não há listagem ou selector dos templates disponíveis. Idealmente o robot deveria permitir listar templates no Bitrix24 como opções seleccionáveis.

**Problema C: Não filtra por `template_type`**
A busca do template (`ilike("name", ...)`) não filtra por `template_type`, podendo encontrar templates de contrato em vez de proposta.

### 2. Robot `emmely_send_proposal` — OK com ressalvas

**Funcionamento geral: correcto.** Suporta `link`, `pdf` e `both`. Gera PDF on-demand se necessário. Mensagem personalizada funciona.

**Problema A: PDF é HTML, não PDF real**
A Edge Function `proposal-pdf` gera um ficheiro `.html` e guarda-o no storage como `proposal-{id}.html`. O URL devolvido é de um HTML — não é um PDF real. O nome do robot e do campo diz "PDF" mas entrega HTML. Isto pode causar confusão ao cliente que recebe o link.

**Problema B: sem `template_id` no proposal, o PDF fica sem branding**
Mesmo problema — como o `template_id` não é guardado na proposta (ver problema A acima), o `proposal-pdf` não carrega os `layout_blocks` do template.

---

## Plano de Correção

### Passo 1: Adicionar coluna `template_id` à tabela `proposals`
- Migration: `ALTER TABLE proposals ADD COLUMN template_id UUID REFERENCES proposal_templates(id) ON DELETE SET NULL;`

### Passo 2: Corrigir `handleGenerateProposal` no robot-handler
- Guardar o `template.id` encontrado e incluir `template_id` no INSERT da proposta
- Filtrar por `template_type = 'proposta'` na busca do template

### Passo 3: Listar templates no parâmetro do robot
- No `bitrix24-install`, mudar o campo `template_name` para incluir uma descrição indicando que o utilizador pode consultar os templates disponíveis
- Criar um endpoint auxiliar ou robot de consulta que devolva a lista de templates (alternativa simples: documentar na descrição do campo)

### Passo 4: Corrigir `proposal-pdf` para usar `template_id` da proposta
- A função já verifica `proposal.template_id` — com a coluna preenchida, passará a funcionar automaticamente

### Ficheiros a editar
1. **Migration SQL** — adicionar `template_id` à tabela `proposals`
2. `supabase/functions/bitrix24-robot-handler/index.ts` — `handleGenerateProposal`: incluir `template_id`, filtrar por `template_type`
3. `supabase/functions/bitrix24-install/index.ts` — melhorar descrição do campo `template_name`

