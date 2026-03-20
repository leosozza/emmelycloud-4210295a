

# Editor Visual de Templates de Proposta/Orçamento

## Situação Atual
Os templates são formulários simples com campos de texto (nome, título, descrição, condições, valor, pagamento). O PDF gerado usa um layout HTML hardcoded na Edge Function `proposal-pdf`. Não existe editor visual nem geração por IA.

## Plano de Implementação

### 1. Migração — Adicionar campos visuais ao template
Adicionar colunas à tabela `proposal_templates`:
- `logo_url` (text) — URL do logo carregado
- `header_color` (text, default '#1e293b') — cor do cabeçalho
- `accent_color` (text, default '#0f172a') — cor de destaque
- `body_html` (text) — HTML do corpo editável (blocos organizados)
- `company_name` (text) — nome da empresa no cabeçalho
- `company_tagline` (text) — slogan
- `layout_blocks` (jsonb) — configuração dos blocos visuais (ordem, visibilidade, conteúdo)

### 2. Página dedicada de Editor de Templates
Criar `src/pages/TemplateEditor.tsx` com rota `/propostas/template-editor/:id?`:

**Estrutura do editor em 3 painéis:**
- **Painel esquerdo** — Paleta de blocos arrastáveis (Logo, Cabeçalho, Dados do Cliente, Descrição do Serviço, Valor/Pagamento, Condições, Rodapé, Bloco de Texto Livre)
- **Painel central** — Pré-visualização em tempo real do template (iframe ou div com estilos)
- **Painel direito** — Propriedades do bloco selecionado (cores, fontes, textos, upload de logo)

**Funcionalidades do editor:**
- Drag & drop de blocos para reordenar secções usando `@dnd-kit/core`
- Upload de logo para o bucket `proposal-files`
- Seletor de cores para cabeçalho e acentos
- Edição inline de textos (nome da empresa, tagline, condições padrão)
- Pré-visualização live que reflete todas as alterações
- Botão "Guardar Modelo" que salva o `layout_blocks` JSON + metadados

### 3. Geração de Template por IA
Adicionar ao editor um botão "Gerar com IA":
- O utilizador faz upload de um PDF ou imagem de exemplo
- O ficheiro é enviado para uma nova Edge Function `generate-template-from-image`
- A Edge Function usa Lovable AI (`google/gemini-2.5-pro` com suporte multimodal) para:
  - Analisar o layout visual do documento
  - Extrair estrutura de blocos, cores, textos e posicionamento
  - Devolver um JSON de `layout_blocks` compatível com o editor
- O resultado preenche automaticamente o editor para ajustes manuais

### 4. Atualizar geração de PDF
Modificar `supabase/functions/proposal-pdf/index.ts`:
- Se a proposta tem um template com `layout_blocks`, usar esses blocos para montar o HTML
- Aplicar `logo_url`, `header_color`, `accent_color`, `company_name`
- Renderizar os blocos na ordem definida pelo utilizador
- Manter o layout hardcoded atual como fallback quando não há template visual

### 5. Integrar na página de Propostas
Atualizar a tab "Modelos" em `src/pages/Propostas.tsx`:
- Botão "Editar" nos cards de template agora abre o editor visual (`/propostas/template-editor/:id`)
- Botão "Novo Modelo" oferece escolha: "Criar do zero" (editor vazio) ou "Gerar por IA" (upload)
- Pré-visualização miniatura do template no card (thumbnail do layout)

### Ficheiros a Criar/Editar
1. **Migração SQL** — novas colunas em `proposal_templates`
2. `src/pages/TemplateEditor.tsx` — página do editor visual (novo)
3. `src/components/propostas/TemplateBlock.tsx` — componentes de blocos individuais (novo)
4. `src/components/propostas/TemplatePreview.tsx` — pré-visualização live (novo)
5. `src/components/propostas/TemplateBlockPalette.tsx` — paleta de blocos drag & drop (novo)
6. `supabase/functions/generate-template-from-image/index.ts` — IA para gerar template (novo)
7. `supabase/functions/proposal-pdf/index.ts` — usar layout_blocks na geração
8. `src/pages/Propostas.tsx` — links para o editor
9. `src/App.tsx` — nova rota

### Dependências
- `@dnd-kit/core` e `@dnd-kit/sortable` para drag & drop dos blocos

