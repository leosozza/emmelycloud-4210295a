

## Análise Comparativa: Arquitectura ChatGPT vs. Emmely Cloud — Estado Actual

A arquitectura que o ChatGPT descreveu é exactamente o padrão "estado da arte" para agentes de IA. A boa notícia é que o Emmely Cloud **já implementa ~90% dessa arquitectura**. Abaixo está o mapeamento exacto.

---

### O que JÁ ESTÁ implementado (✅)

| Camada ChatGPT | Implementação Emmely | Ficheiro |
|---|---|---|
| **1. Interface Omnichannel** | WhatsApp API, Instagram, Webchat, Bitrix24, Email | `whatsapp-webhook`, `instagram-webhook`, `wuzapi-webhook` |
| **2. Gateway de Mensagens** | Payload padronizado (conversation_id, message_text, channel) | `flow-engine/index.ts` |
| **3. Classificador de Intenção** | Tool calling com `route_to_agent` + keywords | `ai-process-message` L539-692 |
| **4. Router de Agentes** | Multi-agente com `sub_agent_ids`, detecção de mudança de tópico | `ai-process-message` L136-692 |
| **5. Agentes Especializados** | Tabela `ai_agents` com prompt, modelo, temperatura, tools por agente | DB + `ai-process-message` |
| **6. Memória Curta** | 30 msgs (15 recentes + 15 comprimidas TOON) | `ai-process-message` L39-40, L145-163 |
| **7. Memória Longa** | `user_memory` com extração automática por IA | `ai-process-message` L1048-1118 |
| **8. RAG / Memória Semântica** | pgvector 768dim, `match_chunks` RPC, fallback keyword | `ai-process-message` L434-537 |
| **9. Tools / APIs** | Registry dinâmico (`agent_tools`), webhook fallback, 7 tools built-in | `ai-process-message` L843-958 |
| **10. Prompt Engine** | System prompt + KB + memória + contexto + sentiment + anti-repetição + auto-lang | `ai-process-message` L269-276 |
| **11. Sentiment Analysis** | Heurística + IA, 2x frustração → transfere humano | `ai-process-message` L694-727 |
| **12. Observabilidade** | `ai_usage_logs` (tokens, latência, custo real), dashboard `/observabilidade-ia` | `ObservabilidadeIA.tsx` |
| **13. Feedback** | `conversation_feedback`, thumbs up/down no chat | `MessageBubble.tsx` |
| **14. Self-evaluation** | Score 1-10, retry se < 7 | `ai-process-message` L403-404 |
| **15. Fila Assíncrona** | `message_queue` com debounce, retry, prioridade, pg_trigger + pg_cron | `queue-worker/index.ts` |
| **16. Segurança** | RLS, roles, auth, service_role para backend | Migrations + políticas |
| **17. Multi-provider** | Lovable AI, Ollama/Qwen, providers custom | `ai_providers` + `resolveProvider` |

---

### O que FALTA — Gaps reais (3 itens)

#### 1. Motor de Personalidade separado (Personality Engine)
O ChatGPT descreve um motor de personalidade com **estilo, tom, objectivo, estratégia psicológica** por agente. Actualmente, tudo está dentro do `system_prompt` de cada agente — funciona, mas não é configurável via UI de forma granular.

**Melhoria proposta:** Adicionar campos `personality_style`, `communication_tone`, `strategic_objective` à tabela `ai_agents` e injectá-los automaticamente no prompt engine. Na UI de Agentes, expor estes campos como selectors (ex: tom → "Empático", "Profissional", "Directo").

#### 2. Regras de negócio independentes da IA (Rule Engine)
O ChatGPT menciona um "Sistema de Regras" para decisões que **não devem depender da IA** (ex: "se cliente deve > 30 dias → cobrança forte"). Actualmente, a lógica de regras está distribuída entre flows e o próprio prompt. Não há um engine de regras determinístico separado.

**Melhoria proposta:** Criar uma tabela `business_rules` com condições (field, operator, value) e acções (change_agent, set_priority, auto_reply). O `flow-engine` avalia estas regras **antes** de chamar a IA, garantindo decisões determinísticas.

#### 3. A/B Testing de Agentes e Auto-aprendizado
A camada mais avançada descrita — A/B test de agentes, ajuste automático de prompts com base em feedback, e treinamento contínuo — não existe. O sistema recolhe feedback mas não o usa para optimização automática.

**Melhoria proposta (futuro):** Criar um job periódico que analisa feedback por agente e sugere ajustes de prompt. Implementar rotação A/B onde 2 variantes do mesmo agente são testadas com distribuição 50/50.

---

### Plano de Implementação (2 melhorias práticas)

| # | Melhoria | Ficheiros | Esforço |
|---|----------|-----------|---------|
| 1 | **Personality Engine** — campos `personality_style`, `communication_tone`, `strategic_objective` na tabela `ai_agents` + UI de configuração + injecção automática no prompt | Migration SQL + `AgentFormDialog.tsx` + `ai-process-message` | Médio |
| 2 | **Business Rules Engine** — tabela `business_rules` com avaliação determinística pré-IA no flow-engine | Migration SQL + `flow-engine/index.ts` + UI básica em Automações | Alto |

### Resumo

O Emmely Cloud **já implementa as 12 camadas da arquitectura "estado da arte"** descrita pelo ChatGPT. Os 3 gaps identificados são refinamentos avançados (personalidade granular, regras determinísticas, A/B testing) que elevariam o sistema de "plataforma funcional" para "AgentOS enterprise". A arquitectura core — orquestração, RAG, multi-agente, memória, fila, tools, observabilidade — está sólida e production-ready.

