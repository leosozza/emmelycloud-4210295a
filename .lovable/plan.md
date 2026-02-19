

# Plano: Redesign do iframe Bitrix24 + Remover branding "Lovable"

## Problema 1: Interface do iframe

O `Bitrix24App.tsx` usa inline styles basicos (fundo branco, botoes verdes, sem sombras, sem gradientes). A app principal usa Tailwind, Shadcn, gradientes, cards com bordas arredondadas e badges coloridas.

Como o iframe do Bitrix24 nao carrega o CSS do projeto principal (Tailwind/Shadcn), a solucao e redesenhar os inline styles para replicar a estetica da app principal:

### Alteracoes visuais no `Bitrix24App.tsx`:

**Header:**
- Gradiente linear `#2583d8 -> #7b5ea7 -> #d4728b` (mesmo do header principal)
- Logo "E" com fundo gradiente, texto branco
- Badge de status com cores suaves

**Tabs:**
- Estilo pill/arredondado similar ao header da app principal
- Tab ativa com fundo semi-transparente branco, texto bold
- Icones em vez de emojis

**Cards/Seccoes:**
- Border-radius 12px, sombra suave `0 1px 3px rgba(0,0,0,0.08)`
- Fundo `#fafbfc` nas seccoes
- Tipografia Figtree (font-family fallback)

**Botoes:**
- Botao primario com gradiente azul-roxo (consistente com a marca)
- Botao secundario outline com border suave
- Tamanhos e padding consistentes com Shadcn

**Forms:**
- Inputs com border `#e2e8f0`, focus ring azul
- Labels com texto `#64748b`, uppercase 10px
- Selects estilizados

**Chat Playground:**
- Bubbles com bordas arredondadas assimétricas (como na app principal)
- Bubble do user com gradiente azul, bubble do assistant com fundo cinza claro
- Loading com animacao CSS inline

**Agentes lista:**
- Cards individuais em vez de lista plana
- Avatar com iniciais, badges de modelo/temperatura
- Botoes de acao com hover states

---

## Problema 2: Branding "Lovable"

O provider nativo chama-se "Lovable AI" (slug: `lovable`) na tabela `ai_providers`. Aparece:
- No `AgentCard.tsx` como badge "Lovable AI"
- No `AgentFormDialog.tsx` no select de provider
- No `Bitrix24App.tsx` como `ai_provider: "lovable"`
- No `PlaygroundIA.tsx` como badge "lovable"
- No `Roadmap.tsx` e `ApiDocs.tsx` em textos

### Solucao:
- Renomear na base de dados: `UPDATE ai_providers SET name = 'Emmely AI' WHERE slug = 'lovable'`
- No codigo, o slug `lovable` continua igual (e o identificador tecnico), mas o **nome visivel** muda para "Emmely AI"
- Nos textos do Roadmap e ApiDocs, substituir "Lovable AI" por "Emmely AI" ou simplesmente "IA nativa"
- No `bitrix24-install`, o agente default ja se chama "Emmely AI" -- correto

---

## Ficheiros a modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `src/pages/Bitrix24App.tsx` | Redesign completo dos inline styles (~800 linhas) |
| `src/pages/Roadmap.tsx` | Substituir "Lovable" por "Emmely AI" nos textos |
| `src/pages/ApiDocs.tsx` | Substituir "Lovable AI" por "Emmely AI" na descricao |
| Migracao SQL | `UPDATE ai_providers SET name = 'Emmely AI' WHERE slug = 'lovable'` |

## Resultado esperado

- Iframe do Bitrix24 com visual coerente com a app principal (gradientes, cards, tipografia)
- Zero referencias a "Lovable" visiveis ao utilizador final
- Provider nativo aparece como "Emmely AI" em todas as interfaces

