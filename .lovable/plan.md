
## Adicionar Chat IA na aba CRM Detail Tab do Bitrix24

### O que muda

A aba CRM (que aparece dentro de Leads, Contactos, Negocios) atualmente mostra apenas o historico de mensagens e botoes de acao. Vamos adicionar um **painel de Chat IA integrado** com tabs para que o operador possa alternar entre ver as mensagens do cliente e consultar a Emmely AI -- tudo dentro da mesma aba.

### Como funciona

A interface tera **duas abas** no topo:
- **Conversa** (tab atual) -- mostra historico de mensagens, badge de modo bot/humano, botoes de acao
- **Consultar IA** (nova tab) -- chat interno com a Emmely AI, com contexto do cliente e da conversa atual

O chat IA inclui:
- Botoes rapidos: Resumir, Procedimento, Sugerir Resposta, Sentimento
- Campo de texto para perguntas livres
- Contexto automatico com nome do cliente, telefone, canal e historico da conversa
- Flag `skip_send: true` para que nada seja enviado ao cliente

### Alteracao

**Ficheiro: `supabase/functions/bitrix24-crm-tab/index.ts`**

Modificar a funcao `renderHtml` para:

1. Adicionar CSS para tabs (`.tab-bar`, `.tab`, `.tab.active`, `.tab-content`)
2. Adicionar CSS para o chat IA (`.ai-messages`, `.ai-msg`, `.ai-input-area`, `.ai-suggestions`)
3. No HTML body, envolver o conteudo existente num sistema de tabs:
   - Tab "Conversa" contem o header + messages + footer atuais
   - Tab "Consultar IA" contem o chat IA (campo input, botoes rapidos, area de mensagens)
4. No JavaScript, adicionar:
   - Funcao `switchTab(tabName)` para alternar entre abas
   - Funcao `sendAiMessage()` que chama `ai-process-message` com `skip_send: true`
   - Funcao `quickAsk(text)` para os botoes rapidos
   - Array `aiHistory` para manter historico local da sessao
   - Contexto automatico incluindo nome do cliente, conversa e canal

Apenas 1 ficheiro a editar. Nenhuma nova edge function. Nenhuma migracao de BD.
