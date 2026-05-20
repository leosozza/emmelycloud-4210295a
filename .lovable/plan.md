## Próximos passos — Fases C, D, E, F, G da Emmely Chat Chain

Já implementado (Fase A+B): tabelas `ai_chains`, `ai_chain_executions`, `ai_phase_executions`, versionamento de agentes, edge `ai-chain-executor` com dehallucination prompt + reviewer loop, dashboard `/chain-health`.

Agora vou seguir na ordem de maior ROI imediato.

### Fase C — Reviewer Agent + Quality Gate no envio (sprint atual)

1. **Seed do agente "Revisor Jurídico"** em `ai_agents` (persona dedicada, modelo `google/gemini-3.5-flash` para custo baixo, tools read-only de consulta a `clients`, `proposals`, `financial_records`).
2. **Vincular** `reviewer_agent_id` na chain `atendimento_juridico_padrao`.
3. **Hook obrigatório no `message-send`**: quando `source = 'ai'`, chama edge nova `ai-review-message` antes do envio:
   - Score < 0.75 → bloqueia envio, marca mensagem como `pending_review`, notifica operador (HITL).
   - Score ≥ 0.75 → libera envio normalmente.
4. **Nova tabela `ai_message_reviews`** (audit: message_id, score, feedback, issues, decided_by, decided_at).
5. **UI**: badge "🛡 Revisado IA (score)" na bolha de mensagem em `Atendimento.tsx`; aba "Pendentes de Revisão" para o operador aprovar/reescrever.

### Fase D — Orquestrador (CEO virtual)

6. **Agente "Orquestrador"** que, ao abrir nova conversa/lead, monta dinamicamente uma chain (Triagem → Especialista X → Cálculo → Proposta → Revisor) gravada em `ai_chain_executions` com `chain_id = null` + `phases_override jsonb`.
7. Toggle por conversa (`use_orchestrator boolean`) — opt-in, mantendo roteamento atual como fallback.

### Fase E — Nó "AI Chain" no Flow Editor

8. Novo tipo de nó `ai_chain` em `FlowNodeTypes.ts` + `CustomFlowNode.tsx` com seletor de `ai_chain` ativa, threshold override, e saídas `on_pass` / `on_fail` / `on_escalate`.
9. `NodeConfigPanel.tsx` ganha o painel de config.
10. Rollback semântico: se chain falha, restaura `ledger` e `bot_state` ao snapshot pré-execução.

### Fase F — Memória episódica de casos

11. Tabela `case_episodes` (case_id, area, outcome, resolution_steps, tags, fts_vector, tenant_id) + índice GIN FTS.
12. Trigger ao fechar caso → resume via IA e grava episódio.
13. Tool `recall_similar_case(query, area)` exposta aos especialistas via `ai-process-message`.

### Fase G — Governança e observabilidade avançada

14. UI de **versionamento de agentes**: diff de prompt, ativar versão, A/B test por hash de `conversation_id`.
15. **Chain Health** ganha: dehallucination flags, custo/fase, latência p95, taxa de escalonamento, drill-down por execução.
16. **Replay**: botão "Reexecutar com versão X" na Observabilidade IA para regression test.

### Roll-out

- **Agora**: Fase C completa (maior impacto visível — bloqueia alucinações antes de chegar ao cliente).
- **Próxima iteração**: D + E juntas (orquestração visual).
- **Depois**: F + G.

### Arquivos afetados

- DB: migrations para `ai_message_reviews`, `case_episodes`, seed Revisor + Orquestrador, colunas `use_orchestrator`.
- Edge functions: `ai-review-message` (novo), `message-send` (hook), `ai-chain-executor` (suporte a `phases_override`), `ai-process-message` (tool `recall_similar_case`).
- Front: `Atendimento.tsx` (badge + aba revisão), `Flows.tsx` + `CustomFlowNode.tsx` + `NodeConfigPanel.tsx` (nó AI Chain), `ChainHealth.tsx` (métricas extras), nova `AgentVersions.tsx`.

Posso começar pela **Fase C** já?
