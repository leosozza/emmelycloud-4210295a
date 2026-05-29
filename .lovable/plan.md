## Objetivo
O diagnóstico confirmou que a app Gupshup `EFWhatsAppBr` (ID `51c0694d-...`) está registada com o telefone **`559192953386`** (8 dígitos, sem o 9º dígito). O valor atualmente persistido em `integration_credentials` está como `5591992953386` (13 dígitos), o que causa `Invalid App Details` no envio.

## Passos

1. **Atualizar credencial `GUPSHUP_SOURCE_NUMBER`**
   - Via migração SQL (`UPDATE public.integration_credentials SET credential_value = '559192953386' WHERE provider = 'gupshup' AND credential_key = 'GUPSHUP_SOURCE_NUMBER';`).
   - Garante persistência mesmo que o formulário ainda devolva valor mascarado.

2. **Reforçar auto-correção em `gupshup-send`**
   - A função já chama `fetchCanonicalAppDetails` mas usa os endpoints `/wa/app/{id}/business/profile` e `/wa/app/{id}/business`, que não devolvem `phone` no nível esperado.
   - Adicionar o endpoint `https://api.gupshup.io/wa/app/{appId}` (retorna `{ name, phone }`) ao array de URLs em `fetchCanonicalAppDetails`, e estender `extractCanonicalAppDetails` para ler `payload.app?.phone` e `payload.app?.name`.
   - Resultado: mesmo que o utilizador volte a guardar um número errado, o `gupshup-send` corrige automaticamente antes do envio.

3. **Validação**
   - Chamar `gupshup-send` via `curl_edge_functions` com uma mensagem de texto de teste para confirmar `status: "submitted"`.
   - Verificar nos logs que `source` usado foi `559192953386`.

## Detalhes técnicos
- Ficheiro editado: `supabase/functions/gupshup-send/index.ts` (apenas `fetchCanonicalAppDetails` + `extractCanonicalAppDetails`).
- Migração SQL única para atualizar o valor.
- Sem mudanças de UI.