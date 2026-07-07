## Objetivo

1. Expor a página **Templates WhatsApp** dentro do iframe do Bitrix24 (hoje só existe em `/configuracoes` da app standalone).
2. Ampliar o criador de templates para suportar **todos os tipos aceites pelo Gupshup/Meta**: texto, media (imagem/vídeo/documento), localização, botões completos (URL, Quick Reply, Phone, Copy Code para AUTH) e **carrossel** (Marketing Carousel Templates).

## Parte 1 — Expor a aba no iframe Bitrix24

`src/pages/Bitrix24App.tsx`

- Adicionar `"templates"` ao union `ConfigSubTab` (linha 858) e à lista `configSubTabs` (linha 860) com ícone `MessageSquare` e label "Templates WhatsApp".
- No `ConfiguracoesWrapper` (~linha 903) adicionar `{subTab === "templates" && <WhatsappTemplatesTab />}` importando de `@/components/configuracoes/WhatsappTemplatesTab`.
- Nenhuma nova rota — reaproveita o mesmo componente já usado em `/configuracoes`.

## Parte 2 — Suporte a todos os tipos de template

### 2a. Frontend — `src/components/configuracoes/WhatsappTemplatesTab.tsx`

Refazer o diálogo "Novo template" com as seguintes secções:

- **Tipo de template** (novo select `templateType`): `TEXT`, `IMAGE`, `VIDEO`, `DOCUMENT`, `LOCATION`, `CAROUSEL`.
- **Header opcional** por tipo:
  - `TEXT`: input de header text (até 60 chars, aceita `{{1}}`).
  - `IMAGE` / `VIDEO` / `DOCUMENT`: input de URL de exemplo da media (obrigatório para submissão — Gupshup usa como `exampleMedia`).
  - `LOCATION`: sem input adicional; envio real fornece lat/long em runtime.
- **Corpo + exemplos das variáveis** (mantém o atual).
- **Rodapé** (mantém).
- **Botões** — expandir tipos:
  - `URL` (com sub-modos: dinâmica, Stripe token, Emmely token — já existem).
  - `QUICK_REPLY` (já existe).
  - `PHONE_NUMBER` (novo — input de número).
  - `COPY_CODE` (novo — visível apenas quando `category = AUTHENTICATION`).
  - Limite Meta: máx 10 botões, sendo até 2 URL + até 1 Phone + até 10 Quick Reply (validação client-side).
- **Carrossel** (visível apenas quando `templateType = CAROUSEL`):
  - Lista de cards (mín 2, máx 10). Cada card tem: media type (imagem/vídeo), URL de exemplo, corpo do card (com variáveis próprias `{{1}}..`), até 2 botões (URL ou QUICK_REPLY).
  - UI: botão "Adicionar card" + secções colapsáveis por card com os mesmos controlos de botões acima (reutilizando o subcomponente).

Listagem existente na página: passar a mostrar `templateType` e miniatura da media quando aplicável.

### 2b. Backend — `supabase/functions/whatsapp-templates-create/index.ts`

Atualizar o payload enviado ao Gupshup para respeitar o tipo:

- Estender interface `Body` com `templateType`, `header` (union: `{ type: "TEXT", text }` | `{ type: "IMAGE"|"VIDEO"|"DOCUMENT", example: string }` | `{ type: "LOCATION" }`), `cards?: CarouselCard[]`.
- Trocar o hardcoded `form.set("templateType", "TEXT")` por `form.set("templateType", body.templateType || "TEXT")`.
- Quando `templateType` é media, enviar:
  - `mediaId` opcional se já subido, senão usar `exampleMedia` com URL do header.
  - `header` = `{{1}}` (Gupshup exige a variável no header para media).
- Quando `templateType = CAROUSEL`:
  - Enviar campo `cards` como JSON string na estrutura documentada pelo Gupshup:
    ```json
    [{"components":[
      {"type":"HEADER","format":"IMAGE","example":{"header_handle":["https://..."]}},
      {"type":"BODY","text":"...","example":{"body_text":[["v1","v2"]]}},
      {"type":"BUTTONS","buttons":[...]}
    ]}]
    ```
  - `content` do template principal (mensagem que acompanha o carrossel) mantém-se em `body`.
- Botões:
  - Adicionar suporte a `COPY_CODE` (apenas AUTHENTICATION) → `{ type: "COPY_CODE", example: ["123456"] }`.
  - Adicionar `PHONE_NUMBER` já mapeado; passar `phone_number` correctamente.
- Persistir novos campos em `whatsapp_templates`: `template_type`, `header`, `cards` (JSONB).

### 2c. Schema — nova migration

Tabela `whatsapp_templates`: adicionar colunas se ausentes:

```sql
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS header jsonb,
  ADD COLUMN IF NOT EXISTS cards jsonb;
```

Sem alterações em RLS/GRANT (já existentes).

### 2d. Sincronização — `whatsapp-templates-list`

Ao fazer upsert do array vindo do Gupshup, passar também `templateType`, `containerMeta.header`, `containerMeta.cards` para as novas colunas. Manter compatibilidade com registos antigos (fallback `TEXT`).

## Fora de escopo

- Envio em runtime dos novos tipos (media/carrossel) pelo robot `emmely_send_whatsapp_template`. Fica para iteração seguinte — este plano só cobre **criação/submissão** e a listagem no iframe.
- Upload de media própria para o Gupshup (`/wa/app/{id}/upload/media`) — por agora usa apenas URL pública de exemplo.

## Validação

1. Abrir a app dentro do Bitrix24 → Configurações → nova aba "Templates WhatsApp" carrega, lista e permite sincronizar.
2. Criar template `TEXT` simples com botão QUICK_REPLY → aprovado eventualmente.
3. Criar template `IMAGE` com header URL → Gupshup devolve `PENDING` sem erro de payload.
4. Criar template `CAROUSEL` com 2 cards + botões URL → Gupshup aceita.
5. Sincronizar → nova coluna `template_type` preenchida correctamente para todos.
