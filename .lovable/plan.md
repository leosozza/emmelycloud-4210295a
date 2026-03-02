

## Atualizar Roadmap com Todos os Módulos

Analisei o código completo e identifiquei **13 funcionalidades já implementadas** que faltam no roadmap, e **1 funcionalidade marcada como "por iniciar"** que já está concluída. Vou reescrever o array `defaultPhases` no ficheiro `src/pages/Roadmap.tsx`.

### Módulos a ADICIONAR como Concluídos (100%)

| Módulo | Descrição | Evidência |
|---|---|---|
| Treino de Persona via Chat | Chat natural para treinar agentes com preview/confirmar/reverter | AgentTrainingChat.tsx + persona-trainer edge fn |
| Chatbot Toggle por Canal | Ativar/desativar chatbot por canal (WA, IG) com agente selecionado | Integracoes.tsx + chatbot_channel_settings table |
| Chat IA Interno | Chat com agentes IA, sessões persistentes, markdown, áudio | ChatIA.tsx + ai-process-message edge fn |
| Manual do Utilizador | Guia completo /manual com FAQ, quick-start, dicas | Manual.tsx |
| Busca Global (Command Palette) | Ctrl+K pesquisa em leads, clientes, casos, conversas | CommandPalette.tsx (MOVER de "por iniciar" para concluído) |
| Proposta Pública (Aceite Online) | Link público para cliente aceitar proposta e gerar contrato | PropostaPublica.tsx |
| Triagem IA | Classificação automática de leads com IA | Triagem.tsx + ai-triage edge fn |
| Integração Callbell (Instagram) | Envio/recepção de mensagens Instagram via Callbell API | instagram-send, instagram-webhook edge fns |
| Ollama Self-Hosted | Provedor IA local via Ollama com webhook de URL dinâmico | ollama-test-connection, ollama-url-webhook |
| Importador PowerBot | Importação de fluxos de outras plataformas | powerbotImporter.ts |
| Gravação de Áudio & Speech Recognition | Botão de gravar áudio e reconhecimento de fala no chat | AudioRecordButton.tsx + useSpeechRecognition |
| Bitrix24 Field Mapping | Mapeamento visual de campos entre Emmely e Bitrix24 | FieldMappingManager.tsx |
| Dashboard Customizável | Arrastar/reorganizar widgets do dashboard | DashboardCustomizer.tsx |
| Bitrix24 App Embeddable | Interface embeddida para uso dentro do Bitrix24 | Bitrix24App.tsx |
| Redesenho UI (Tema Vermelho/Dourado) | Novo design system com paleta vermelha/dourada e Poppins | index.css atualizado |

### Módulo a MOVER

- **Busca Global**: de "📅 Próximas Etapas" → "✅ Concluído" (CommandPalette.tsx já existe e funciona)

### Alteração

**`src/pages/Roadmap.tsx`** (linhas 59-195) — Reescrever o array `defaultPhases`:
- Adicionar os 15 módulos acima à secção "Concluído"
- Remover "Busca Global" da secção "Próximas Etapas"
- Manter os módulos "Em Progresso" e "Próximas Etapas" existentes (menos Busca Global)
- Total concluídos passará de ~38 para ~53

