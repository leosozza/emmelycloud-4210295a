## Adicionar integração OpenClaw em /integracoes

Adicionar uma nova aba **"OpenClaw"** na página `/integracoes` para o utilizador conectar o seu agente OpenClaw ao Emmely.

### O que vai ser criado

**1. Nova aba "OpenClaw"** em `src/pages/Integracoes.tsx` (junto a IA, Chatbot, etc.)

**2. Componente `OpenClawTab`** com 2 secções:

**A) Emmely → OpenClaw (MCP Server)**
Mostrar ao utilizador, pronto a copiar, os dados que ele precisa de colar dentro do OpenClaw para o agente OpenClaw conseguir executar funções no Emmely (criar pagamentos, consultar leads, enviar mensagens, etc.):
- URL do MCP: `https://emmelycloud.lovable.app/mcp-server`
- Header de auth: `X-API-Key: emk_live_...`
- Botão "Gerar chave API" → abre `/api-docs` (ou cria diretamente uma chave `emk_live_` via fluxo existente)
- Lista resumida das ferramentas disponíveis (CRM, pagamentos, mensagens)

**B) OpenClaw → Emmely (Agente que responde clientes)**
Formulário para guardar a configuração do agente OpenClaw que vai responder a mensagens recebidas:
- Nome do agente
- Endpoint HTTP do agente OpenClaw (URL onde o Emmely envia a mensagem do cliente)
- Método (POST), formato de payload (preset: `{ message, conversation_id, contact }`)
- Header de autenticação (Bearer token / API key) — guardado encriptado
- Toggle "Ativo"
- Botão "Testar conexão" (envia um ping ao endpoint e mostra resposta)

### Onde os dados ficam guardados

Nova tabela `openclaw_integrations`:
- `name`, `agent_endpoint`, `auth_header_name`, `auth_token` (texto), `payload_template` (jsonb), `is_active`, `created_by`, timestamps
- RLS: só `admin` pode ler/escrever (consistente com `bitrix24_integrations`)

### Edge function

`supabase/functions/openclaw-send/index.ts` — envia uma mensagem ao endpoint OpenClaw configurado e devolve a resposta. Vai ser usada depois pelo pipeline de chat (não faz parte desta tarefa ligar ao pipeline — só criar a integração e o transporte).

### Ficheiros tocados

- `src/pages/Integracoes.tsx` — adicionar `TabsTrigger`/`TabsContent` "openclaw" + componente `OpenClawTab`
- `supabase/migrations/...` — tabela `openclaw_integrations` + RLS
- `supabase/functions/openclaw-send/index.ts` — proxy de envio + teste
- `supabase/config.toml` — registar a função

### Fora do âmbito (próximo passo)

Ligar o `openclaw-send` ao motor de chatbot para responder automaticamente em WhatsApp/Instagram. Fica para depois de validares a aba e a conexão.