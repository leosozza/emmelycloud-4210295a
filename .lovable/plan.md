

# Criar Agente com IA — Chat Modal + Botao Duplo

## Resumo

Adicionar um botao "Criar com IA" ao lado do "Novo Agente" existente. Ao clicar, abre um modal de chat onde o utilizador descreve o agente desejado em linguagem natural. A IA faz perguntas clarificadoras e no final propoe o agente completo para confirmacao.

## Implementacao

### 1. Edge Function `agent-builder` (novo)

- Recebe `{ messages: [...], context: { available_skills, flows, collections, existing_agents } }`
- System prompt instrui a IA a:
  1. Analisar o pedido do utilizador
  2. Fazer 2-3 perguntas clarificadoras (tom, skills, confirmacoes)
  3. Quando tiver info suficiente, responder com um bloco JSON marcado `:::agent-config` contendo todos os campos do agente
- Usa Lovable AI Gateway (`google/gemini-3-flash-preview`) via `LOVABLE_API_KEY`
- Streaming SSE para respostas em tempo real

### 2. Componente `AgentBuilderChat.tsx` (novo)

- Dialog `max-w-2xl` com interface de chat simples
- Input de texto + lista de mensagens com markdown
- Streaming SSE das respostas
- Quando detecta o bloco `:::agent-config` na resposta:
  - Renderiza um card de resumo do agente proposto (nome, skills, modelo, prompt)
  - Botoes "Criar Agente" e "Ajustar"
  - Ao confirmar, chama `onSave(agentConfig)` que insere no DB via a logica existente do `Agentes.tsx`

### 3. Pagina `Agentes.tsx` (alteracao)

- Adicionar estado `builderOpen` e botao "Criar com IA" com icone `Sparkles`
- Callback `handleBuilderSave` que recebe o JSON do agente, insere no `ai_agents` + `agent_skills`, e recarrega a lista

### Ficheiros

| Ficheiro | Accao |
|---|---|
| `supabase/functions/agent-builder/index.ts` | **Novo** — Edge function com streaming |
| `src/components/agentes/AgentBuilderChat.tsx` | **Novo** — Modal de chat |
| `src/pages/Agentes.tsx` | Adicionar botao + estado para o builder |

### Fluxo de Interaccao

```text
User: "Quero um agente de agendamento que consulta agenda no Bitrix24"
  ↓
IA: "Perfeito! Algumas perguntas:
     1. Qual o nome do agente?
     2. Tom formal ou informal?
     3. Deve confirmar antes de agendar?"
  ↓
User: "Sofia, formal, sim"
  ↓
IA: "Aqui está o agente proposto:
     [Card: Sofia | Skills: CRM, Webhook | Modelo: Gemini Flash]
     Posso criar?"
  ↓
User confirma → Agente criado com skills + prompt especializado
```

### Context Injection

A edge function recebe automaticamente:
- `SKILL_TYPES` completos com descricoes
- Lista de flows existentes (id + nome)
- Colecoes de knowledge base existentes
- Agentes existentes (para sub-agentes)

Isto garante que a IA sabe exactamente quais skills activar com base na descricao do utilizador.

