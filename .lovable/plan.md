

## Widgets IM do Bitrix24: Sidebar + Menu de Contexto

Adicionar dois novos widgets no messenger do Bitrix24 para que os operadores possam consultar a Emmely AI antes de responder aos clientes.

### Caso de Uso

- **IM_SIDEBAR**: Painel lateral permanente no chat. O operador abre, ve o contexto da conversa atual e pergunta a Emmely AI qual o melhor procedimento. A IA analisa toda a conversa e o treinamento do agente para recomendar a melhor abordagem.
- **IM_CONTEXT_MENU**: Menu de contexto numa mensagem especifica ("Criar conteudo baseado em..."). O operador clica com botao direito numa mensagem do cliente e pede a Emmely para resumir, traduzir ou sugerir uma resposta.

### Ficheiros a Criar

**1. `supabase/functions/bitrix24-im-sidebar/index.ts`**
- Serve HTML com interface de chat embebida no painel lateral do messenger
- Parseia PLACEMENT_OPTIONS para obter DIALOG_ID do chat atual
- Interface com campo de texto + historico de mensagens
- Chama `ai-process-message` com `skip_send: true` para obter respostas sem enviar ao cliente
- Usa agente default ou agente configurado para o canal
- Headers iframe seguros (X-Frame-Options: ALLOWALL, frame-ancestors *)
- Tema sincronizado via parametro LANG
- Dimensoes: sidebar padrao do Bitrix24

**2. `supabase/functions/bitrix24-im-context-menu/index.ts`**
- Serve HTML com acoes rapidas sobre a mensagem selecionada
- Parseia PLACEMENT_OPTIONS para obter o contexto da mensagem
- 4 botoes de acao: Resumir Conversa, Traduzir, Sugerir Resposta, Analisar Sentimento
- Cada acao chama `ai-process-message` com prompt especifico e `skip_send: true`
- Resultado apresentado numa caixa copiavel com botao "Copiar"
- Headers iframe seguros
- Dimensoes compactas (slider padrao)

### Ficheiro a Editar

**3. `supabase/functions/bitrix24-rebind-events/index.ts`**
- Adicionar registo de placement `IM_SIDEBAR` apontando para `bitrix24-im-sidebar`
  - Titulo: "Emmely AI Assistant"
  - LANG_ALL em pt, en, es, ru
- Adicionar registo de placement `IM_CONTEXT_MENU` apontando para `bitrix24-im-context-menu`
  - Titulo: "Analisar com Emmely"
  - LANG_ALL em pt, en, es, ru
- Unbind antes de bind (mesmo padrao do IM_TEXTAREA existente)
- Incluir resultados no JSON de resposta

### Detalhes Tecnicos

- Ambos os widgets recebem POST com `member_id`, `PLACEMENT`, `PLACEMENT_OPTIONS` (JSON string com DIALOG_ID/CHAT_ID)
- Seguem o padrao existente do `bitrix24-return-to-bot`: HTML com BX24 SDK, headers de iframe, parsing de body form-urlencoded ou JSON
- A comunicacao com a IA usa `ai-process-message` com `skip_send: true` para que as respostas NAO sejam enviadas ao cliente -- sao apenas para o operador consultar
- O sidebar mantem estado local da conversa operador-IA (nao persiste em BD, e efemero por sessao)
- O context menu faz chamada unica e mostra resultado
- Nenhuma migracao de base de dados necessaria
- Nenhum secret novo necessario (usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ja existentes)

