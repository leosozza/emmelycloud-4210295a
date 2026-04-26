## Contexto

O conector **Emmely Messages** já está registado no Bitrix24 (via `imconnector.register`) e cria automaticamente um `bitrix24_channel_mappings` por cada Canal Aberto onde o utilizador ativar o conector dentro do Bitrix24 (placement `SETTING_CONNECTOR`).

Hoje existe **2 mapeamentos ativos** no portal (linhas 17 e 19) e **2 instâncias WhatsApp** ativas (`emmely br`, `WhatsApp QRCode`). Apenas a primeira está vinculada (campo `config.bitrix24_mapping_id`). A segunda envia para "qualquer mapeamento ativo" (fallback do `bitrix24-send`), o que pode encaminhar mensagens para a linha errada.

## Objetivo

Garantir que, ao conectar uma instância WhatsApp ao Bitrix24, o utilizador escolhe **explicitamente** qual Canal Aberto recebe as mensagens daquela instância — uma instância ↔ uma linha (1:1).

## Análise do MCP / API Bitrix24

Métodos relevantes confirmados via MCP:
- `imconnector.register` — regista o conector "emmely_connector" (uma vez por portal). ✓ já feito.
- `imconnector.activate` — ativa o conector numa LINE específica. ✓ já feito por `bitrix24-connector-settings`.
- `imconnector.connector.data.set` — define metadados (nome, URL handler) por LINE. ✓ já feito.
- `imconnector.send.messages` — envia mensagem para a LINE correta usando `CONNECTOR + LINE + CHAT.id`. ✓ já usado em `bitrix24-send`.
- `imopenlines.config.list.get` — lista as linhas disponíveis. ✓ já usado para popular `line_name`.

**Conclusão**: a infraestrutura no Bitrix24 já suporta múltiplas linhas por conector. O que falta é **bloquear o fallback** e tornar a seleção obrigatória/visível por instância.

## Mudanças

### 1. UI — Página Integrações (vincular instância → linha)
Arquivo: `src/pages/Integracoes.tsx`

- O `Select` "Vincular ao Bitrix24" já existe (`handleLinkToBitrix`). Vamos:
  - Mostrar **badge de aviso** vermelho quando uma instância ativa não tem `bitrix24_mapping_id` definido.
  - Filtrar do dropdown mapeamentos já usados por outra instância (evitar duplicação 1:N).
  - Mostrar `line_name` + `line_id` na lista para clareza.
  - Adicionar um pequeno texto explicativo: *"Cada instância só pode ligar a 1 Canal Aberto."*

### 2. UI — Aba "Canais Bitrix24"
Adicionar uma secção informativa que liste:
- Linhas disponíveis no portal (`bitrix24_channel_mappings`).
- Para cada uma: instância vinculada (ou "não vinculada").
- Botão "Sincronizar linhas" que chama `bitrix24-connector-settings?format=json` e atualiza nomes de linhas.

### 3. Backend — `bitrix24-send`
Arquivo: `supabase/functions/bitrix24-send/index.ts`

**Remover o fallback "qualquer mapeamento ativo"** (linhas 315–347). Em vez disso:
- Se a mensagem é originada de uma `channel_instance`, ler `config.bitrix24_mapping_id` e usar exatamente essa linha.
- Se não houver `mapping_id` (instância não vinculada), **não enviar** e registar `no_channel_mapping_for_instance` em `bitrix24_debug_logs`.
- Adicionar parâmetro opcional `instance_id` na payload do `bitrix24-send` para que o caller (webhooks WUZAPI / Meta) passe a instância de origem.

### 4. Webhooks que originam mensagens
Verificar e atualizar os pontos onde `bitrix24-send` é invocado a partir de mensagens recebidas (WUZAPI / Meta) para passar `instance_id` ou já o `lineId` resolvido a partir do `channel_instances.config.bitrix24_mapping_id`. Pontos a inspecionar:
- `supabase/functions/wuzapi-webhook` (encaminhamento já documentado em memória).
- `supabase/functions/meta-webhook` (Instagram/WhatsApp Cloud).

### 5. Validação UX
- Toast de erro claro quando o utilizador tenta ativar uma instância sem linha vinculada.
- Tooltip no badge a explicar como vincular.

## Pontos técnicos importantes

- Não é necessária migração SQL — `channel_instances.config` (jsonb) já guarda `bitrix24_mapping_id`.
- Não é necessário re-registar o conector no Bitrix24.
- O unique constraint atual (`integration_id, channel, line_id`) garante que uma linha não duplica entradas.
- Vamos adicionar **constraint lógica no frontend**: um `mapping_id` só pode estar em uso por uma `channel_instance` (validar antes do update).

## Diagrama do fluxo após as mudanças

```text
WhatsApp (WUZAPI)                    Bitrix24
       │                                 │
       ▼                                 │
 channel_instance "emmely br"            │
   config.bitrix24_mapping_id ──┐        │
                                ▼        │
                    bitrix24_channel_mappings
                       (line_id = 19)
                                │
                                ▼
                    imconnector.send.messages
                       (CONNECTOR=emmely_connector,
                        LINE=19)
                                │
                                ▼
                       Open Line "WhatsApp BR"
```

## Ficheiros que serão alterados

- `src/pages/Integracoes.tsx` (UI vinculação + aba canais)
- `supabase/functions/bitrix24-send/index.ts` (remover fallback + suportar `instance_id`)
- `supabase/functions/wuzapi-webhook/index.ts` (passar `instance_id` ou resolver `lineId`)
- `supabase/functions/meta-webhook/index.ts` (idem, se aplicável)

Sem alterações de schema necessárias.
