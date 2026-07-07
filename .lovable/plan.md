## Objetivo

Gerir templates HSM do WhatsApp (criar, submeter para aprovação, listar status) direto no Emmely, sem abrir o painel Gupshup. Depois usar esses templates aprovados nos envios (robot Bitrix24 + UI de atendimento) para entregar botão CTA de verdade.

## API Gupshup usada

Gupshup Partner API expõe endpoints de templates por app:

- `POST   /partner/app/{appId}/templates` — cria e submete template (nome, categoria, idioma, corpo, botões, exemplos)
- `GET    /partner/app/{appId}/templates` — lista todos (com `status`: APPROVED/PENDING/REJECTED)
- `DELETE /partner/app/{appId}/templates/{elementName}` — apaga
- `GET    /partner/app/{appId}/templates/{elementName}` — detalhe

Auth: `token` do Partner (já usamos em outras chamadas — reaproveitar credenciais existentes em `integration_credentials` / secret Gupshup). Se o token de Partner ainda não estiver salvo, pedir via `add_secret` (`GUPSHUP_PARTNER_TOKEN` + `GUPSHUP_APP_ID`).

## Backend

### 1. Tabela `whatsapp_templates` (migration)

```
id uuid pk
provider text default 'gupshup'          -- deixa aberto p/ Meta Cloud API futuramente
app_id text                                -- app Gupshup
element_name text                          -- nome único no Gupshup (snake_case)
category text                              -- MARKETING | UTILITY | AUTHENTICATION
language text default 'pt_BR'
body text                                  -- texto com {{1}} {{2}}...
header jsonb                               -- {type, text|media_url} opcional
footer text
buttons jsonb                              -- [{type:'URL', text, url, example}] etc.
example jsonb                              -- variáveis de exemplo
status text                                -- PENDING | APPROVED | REJECTED | LOCAL_DRAFT
rejection_reason text
gupshup_template_id text
created_by uuid references profiles(id)
created_at, updated_at
```
+ GRANTs + RLS (admin/comercial read/write, service_role all).

### 2. Edge Functions (novas)

- `whatsapp-templates-list` — GET Gupshup `/templates`, faz upsert em `whatsapp_templates` e retorna a lista. Aceita `?refresh=true` para sincronizar.
- `whatsapp-templates-create` — recebe payload do form, valida com Zod, chama `POST /templates` no Gupshup, guarda linha com `status=PENDING`.
- `whatsapp-templates-delete` — chama `DELETE` no Gupshup e remove localmente.
- `whatsapp-templates-sync` — job/cron opcional que refaz o list periodicamente para atualizar `status` (aprovação Meta ~24h).

### 3. Envio usando template

Ampliar `gupshup-send` (já em produção) para aceitar `message_type: "template"`:

```ts
{
  message_type: "template",
  template: {
    id: "<gupshup_template_id>",
    params: ["Fulano", "R$ 500,00"]        // {{1}} {{2}} do corpo
  }
}
```

Gupshup v1: `POST /wa/api/v1/template/msg` com `template={"id":..., "params":[...]}`. Para botão URL dinâmico já existe suporte via `params` na posição do `{{1}}` do botão.

Propagar em `message-send` (roteador) igual aos outros types, e em `bitrix24-robot-handler` adicionar suporte para `template_id` no payload do robot de envio de link de pagamento.

## Frontend

### Rota `/configuracoes/whatsapp-templates`

- **Lista** — tabela com nome, categoria, idioma, status (badge colorido PENDING/APPROVED/REJECTED), botão preview, botão apagar. Botão "Sincronizar" chama `whatsapp-templates-list?refresh=true`.
- **Criar template** — modal/drawer com:
  - Nome (auto-normalizado para snake_case)
  - Categoria (select MARKETING/UTILITY/AUTHENTICATION)
  - Idioma (pt_BR / pt_PT / en_US)
  - Corpo com detecção automática de `{{n}}` e campo de exemplo por variável
  - Footer (opcional)
  - Botões: repeater com tipo (URL / QUICK_REPLY / PHONE) e campos condicionais. Para URL: texto + URL (com opção `{{1}}` dinâmico + exemplo)
  - Preview lado-a-lado tipo bolha WhatsApp
  - Submit → `whatsapp-templates-create`
- **Aviso** — banner explicando que aprovação Meta leva até 24h e status vai atualizar sozinho.

### Uso nas telas de envio

- **UI Atendimento** (`/atendimento/*`): quando fora de janela 24h ou ao anexar link de pagamento, mostrar seletor "Enviar via Template" com dropdown de templates `APPROVED` filtrados por categoria, campos para preencher variáveis, e botão "Enviar".
- **Bitrix24 robot** (envio automático de link de pagamento): novo campo no config do robot "Template WhatsApp (opcional)" — se preenchido, usa template com URL do checkout como parâmetro do botão; senão cai no fluxo atual de texto.

## Detalhes técnicos

- **Credenciais**: reaproveitar segredo Gupshup Partner já usado em outras funções; validar existência no início de cada function e retornar 500 explícito se faltar. Se faltar `GUPSHUP_PARTNER_TOKEN` ou `GUPSHUP_APP_ID`, solicito via `add_secret` numa etapa separada antes do código.
- **Idempotência**: `element_name` único por `app_id` no banco; UPSERT em cima disso.
- **Erros Meta**: `status = REJECTED` + `rejection_reason` do payload Gupshup exibidos no card.
- **Rate limits**: Gupshup permite ~100 templates/app; a UI mostra contador.
- **Sem alteração** em tabelas críticas (`messages`, `financial_records`) — só nova tabela e novos endpoints.

## Fora de escopo

- Editar template já submetido (Meta não permite; só apagar e recriar).
- Templates Meta Cloud API direto (fica preparado por `provider`, mas a UI só cobre Gupshup nesta fase).
- Templates com mídia rica (imagem/vídeo/documento no header) — v2.

## Confirmação necessária antes de implementar

1. Confirma o token Partner Gupshup — se ainda não tenho `GUPSHUP_PARTNER_TOKEN` + `GUPSHUP_APP_ID` salvos como segredo (uso hoje só o app-level API key para envio), peço via `add_secret` no início do build.
2. Ok começar com só Gupshup (Meta Cloud fica para depois)?
