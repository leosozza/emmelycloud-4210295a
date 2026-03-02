

## Corrigir Bug Critico no message-send + Alinhar com API WUZAPI

### Bug Encontrado

No `message-send/index.ts`, o bloco WUZAPI (linha 282) e **inalcancavel**. A condicao `else if (conv.channel === "whatsapp" && resolvedProvider === "wuzapi")` nunca executa porque o bloco anterior (linha 195) ja captura `conv.channel === "whatsapp"` sem verificar o provider. Resultado: mensagens enviadas por WhatsApp QRCode tentam sempre a Meta Cloud API e falham.

### Correcao

**1. Editar `supabase/functions/message-send/index.ts`**
- Mover a logica WUZAPI para DENTRO do bloco `conv.channel === "whatsapp"`, verificando `resolvedProvider` antes de escolher Meta ou WUZAPI
- Estrutura corrigida:
```text
if (conv.channel === "whatsapp") {
  if (resolvedProvider === "wuzapi") {
    → enviar via WUZAPI endpoints
  } else {
    → enviar via Meta Cloud API (existente)
  }
}
```

**2. Verificar endpoints WUZAPI contra API docs**
- Os endpoints `/chat/send/text`, `/chat/send/image`, `/chat/send/audio`, `/chat/send/document`, `/chat/send/video` estao correctos conforme a API
- Header de autenticacao `token` esta correcto (user token)
- A API tambem suporta `/chat/send/sticker`, `/chat/send/location`, `/chat/send/contact`, `/chat/send/buttons`, `/chat/send/list` — adicionar suporte a buttons e list

**3. Editar `supabase/config.toml`**
- Adicionar entradas em falta para `wuzapi-webhook` e `wuzapi-test-connection` (se ainda nao existirem)

### Resumo
| Ficheiro | Accao |
|---|---|
| `supabase/functions/message-send/index.ts` | Corrigir branch unreachable do WUZAPI |
| `supabase/config.toml` | Verificar/adicionar funcoes wuzapi |

