
## Problema

No iframe do Bitrix24 (placement `CRM_*_DETAIL_TAB` — `bitrix24-crm-tab`), quando o contacto não tem conversa ativa, aparece o card **"Iniciar conversa"** com um `<textarea>` livre e um dropdown que mostra apenas as *Respostas Rápidas internas* (`quick_replies`). Não há opção para escolher um **template HSM aprovado no Gupshup**, que é o ÚNICO tipo de mensagem que o WhatsApp Oficial permite enviar fora da janela de 24h. Resultado: o utilizador clica "Iniciar no WhatsApp", o Gupshup recusa a mensagem livre e a conversa nunca arranca.

A função `gupshup-send` JÁ suporta `message_type: "template"` com `{ id, params[] }`, e `message-send` JÁ encaminha esse payload. Falta a UI + a forma de listar os templates aprovados.

## O que vamos construir

### 1. Listagem de templates do Gupshup
Nova edge function `gupshup-templates` (GET) que:
- Lê `GUPSHUP_API_KEY` e `GUPSHUP_APP_ID` da tabela `integration_credentials` (provider=`gupshup`).
- Chama `GET https://api.gupshup.io/sm/api/v1/template/list/{appId}` com header `apikey`.
- Devolve apenas templates com `status === "APPROVED"`, no formato:
  ```json
  { "templates": [{
    "id": "<gupshup_template_id>",
    "elementName": "promo_welcome",
    "category": "MARKETING",
    "language": "pt_BR",
    "body": "Olá {{1}}, ...",
    "exampleParams": ["João"],
    "paramCount": 1
  }] }
  ```
- Cache em memória 5 min (revalidação manual via `?refresh=1`).

Requer **App ID** do Gupshup (não usado no envio v1). Adicionar campo opcional `GUPSHUP_APP_ID` ao formulário Gupshup em `src/pages/Integracoes.tsx` (auto-save igual aos restantes). Sem `APP_ID` configurado, a função devolve `{ templates: [], reason: "missing_app_id" }` e a UI mostra um aviso para configurar.

### 2. Atualização do "Iniciar conversa" em `bitrix24-crm-tab`
No HTML gerado em `bitrix24-crm-tab/index.ts` (bloco `startConvHtml`, linhas ~438-476 e função JS `startConversation` ~1125-1164):

- Substituir o dropdown atual (que mistura quick replies) por DOIS controlos separados:
  - **Resposta rápida interna** (mantém o comportamento atual de preencher o textarea livre — só funciona dentro da janela 24h).
  - **Template WhatsApp Oficial (HSM)** — novo `<select>` carregado em runtime via `fetch('/functions/v1/gupshup-templates')`.
- Ao selecionar um template:
  - Esconder o `<textarea>` livre.
  - Renderizar dinamicamente N inputs (`<input>`) — um por placeholder `{{1}}..{{N}}` detetado em `body`.
  - Mostrar pré-visualização do `body` com os valores substituídos em tempo real.
- O botão "Iniciar no WhatsApp" passa a:
  - Se template selecionado → enviar para `message-send` com:
    ```json
    {
      "conversation_id": "<id>",
      "message_type": "template",
      "content": "<preview text resolvido>",
      "resolvedInteractiveData": { "id": "<gupshup id>", "params": ["valor1", "valor2"] }
    }
    ```
  - Se nenhum template → comportamento atual (texto livre, sujeito à janela 24h).
- Validação no cliente:
  - Bloquear envio se template tem N params e algum input está vazio.
  - Aviso visível: "Fora da janela de 24h, só templates HSM aprovados podem iniciar conversa".

### 3. Suporte a `resolvedInteractiveData` em `message-send`
Confirmar que o nome do campo é coerente — atualmente `message-send` lê `resolvedInteractiveData` no body (já visto em `message-send/index.ts:336`). Nenhuma mudança de backend necessária além da nova função `gupshup-templates`; o pipeline de template já está pronto.

## Ficheiros tocados

```text
NOVO   supabase/functions/gupshup-templates/index.ts   (~120 linhas)
EDIT   supabase/functions/bitrix24-crm-tab/index.ts    (~80 linhas alteradas: HTML + JS startConversation)
EDIT   src/pages/Integracoes.tsx                       (~15 linhas: campo GUPSHUP_APP_ID)
```

Sem migrações SQL. Sem novas secrets globais (credenciais ficam em `integration_credentials`).

## Detalhes técnicos

- A API Gupshup para listar templates exige **App ID** (UUID do app no painel Gupshup), distinto do App Name. Documentado como opcional na conversa anterior — agora torna-se obrigatório apenas para esta funcionalidade.
- Parsing de placeholders: regex `/\{\{(\d+)\}\}/g`, contar valores únicos, ordenar por número.
- A função `gupshup-templates` corre com `verify_jwt = false` (mesma postura dos outros endpoints do iframe) e valida apikey de Supabase via header padrão.
- Preview text no `content` da conversa garante que a UI do Atendimento mostra a mensagem correta na timeline (não só o `template.id`).

## Fora de scope

- Criar/editar templates no Gupshup a partir do app (gerido no painel Gupshup).
- Suporte a templates com componentes de media (header image/video) — só body+params nesta fase.
- Templates Meta Cloud API (apenas Gupshup BSP).
