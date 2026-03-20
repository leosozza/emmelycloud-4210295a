

# Adicionar Propostas e Templates ao iframe Bitrix24

## Objectivo
Disponibilizar a gestão de propostas, templates de orçamento e o editor visual de templates dentro do módulo Bitrix24 (`/bitrix24/propostas`), incluindo sub-navegação para o editor de templates.

## Alterações

### 1. Adicionar "propostas" como nova view
**Ficheiro:** `src/pages/Bitrix24App.tsx`

- Adicionar `"propostas"` ao type `AppView`
- Adicionar na navegação, na secção "Emmely CRM":
  ```
  { id: "propostas", label: "Propostas", icon: FileText }
  ```
- Adicionar `{view === "propostas" && <PropostasView ... />}` no render principal

### 2. Criar PropostasView dentro do Bitrix24App
**Ficheiro:** `src/pages/Bitrix24App.tsx`

Criar uma nova função `PropostasView` que replica a funcionalidade da página `Propostas.tsx` adaptada ao contexto do iframe:

- **Tab "Propostas"**: Listagem, criação, edição, envio, aceite, PDF — reutilizando `PropostaForm` e `PropostaTemplateForm`
- **Tab "Modelos"**: Cards de templates com botões Editor Visual, Editar, Duplicar, Eliminar
- **Editor Visual inline**: Ao clicar "Editor Visual", trocar para uma sub-vista que renderiza o `TemplateEditor` directamente dentro do iframe (em vez de navegar para `/propostas/template-editor/:id` que sairia do contexto Bitrix24)
- Adaptar a navegação do `TemplateEditor` — o botão "Voltar" regressa à lista de modelos em vez de navegar para `/propostas`

### 3. Adaptar TemplateEditor para uso embebido
**Ficheiro:** `src/pages/TemplateEditor.tsx`

- Adicionar prop opcional `onBack?: () => void` para permitir navegação customizada quando usado dentro do iframe
- Se `onBack` for fornecido, usar essa callback no botão de voltar em vez de `navigate("/propostas")`
- Após guardar com sucesso, chamar `onBack` em vez de `navigate("/propostas")`

### 4. Rota Bitrix24 para propostas
**Ficheiro:** `src/App.tsx`

- Adicionar rota `/bitrix24/propostas` e `/bitrix24/propostas/template-editor/:id?` que mapeia para o `Bitrix24App`

### Ficheiros a editar
1. `src/pages/Bitrix24App.tsx` — nova view + navegação
2. `src/pages/TemplateEditor.tsx` — suporte a `onBack` prop
3. `src/App.tsx` — rotas adicionais (se necessário para deep linking)

