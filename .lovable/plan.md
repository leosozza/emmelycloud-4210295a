
# Corrigir Arquitetura Bitrix24 - Baseado no Projeto Thothai

## Problema Identificado

A arquitetura atual esta errada. Comparando com o projeto thothai (que funciona), os erros sao:

1. **Install URL aponta para o frontend** - Errado! O Bitrix24 envia um POST com tokens OAuth durante a instalacao. O frontend nao consegue receber isso. Deve apontar para a edge function `bitrix24-install`
2. **Connector Settings sem headers de iframe** - Falta `X-Frame-Options: ALLOWALL` e `frame-ancestors *`. O Supabase adiciona `X-Frame-Options: SAMEORIGIN` por defeito, que bloqueia o iframe do Bitrix24
3. **Frontend tentando gerir a instalacao** - O `Bitrix24App.tsx` tenta carregar o BX24 SDK e fazer fetch - desnecessario. A instalacao deve ser 100% na edge function

## Como funciona no Thothai (correto)

```text
Bitrix24 Marketplace URLs:
  - Install URL      -> edge function /bitrix24-install (POST com tokens)
  - Application URL  -> edge function /bitrix24-connector-settings (iframe UI) OU frontend
  - Settings Handler -> edge function /bitrix24-connector-settings (PLACEMENT_HANDLER)

Fluxo de instalacao:
  1. Bitrix24 envia POST para /bitrix24-install com auth[access_token], auth[member_id], etc.
  2. Edge function guarda tokens, regista conector, ativa em Open Lines, vincula eventos
  3. Edge function retorna HTML com BX24.installFinish() e headers de iframe corretos
  4. Bitrix24 marca app como instalado

Fluxo de configuracao (Contact Center > Settings):
  1. Bitrix24 abre /bitrix24-connector-settings em iframe slider
  2. Edge function retorna HTML com X-Frame-Options: ALLOWALL
  3. HTML mostra status do conector, canais mapeados, etc.
  4. Retorna "successfully" quando conector esta pronto
```

## Plano de Alteracoes

### 1. Atualizar `bitrix24-install` (edge function)

- Adicionar headers de iframe: `X-Frame-Options: ALLOWALL`, `frame-ancestors *`
- Manter logica atual de guardar tokens e registar conector
- Melhorar o HTML de retorno com UI mais profissional (como no thothai)
- Garantir que `BX24.installFinish()` e chamado no HTML retornado

### 2. Atualizar `bitrix24-connector-settings` (edge function)

Mudancas criticas:
- Adicionar `X-Frame-Options: ALLOWALL` nos headers (resolve o bloqueio do iframe)
- Mudar `frame-ancestors` de lista especifica para `*` (wildcard)
- Manter suporte a GET com JSON para o frontend
- Melhorar o HTML de configuracao com status do conector, canais e acoes
- Retornar `"successfully"` (texto plano) quando conector esta totalmente configurado

### 3. Atualizar `Bitrix24App.tsx` (frontend)

O frontend serve para quando o Application URL aponta para o frontend (para utilizadores acederem via menu do Bitrix24). Manter a logica de tabs mas:
- Remover a tentativa de instalacao via frontend (nao e necessario)
- Manter apenas a UI de gestao (status, canais, pagamentos, automacoes)
- Continuar a usar fetch para obter dados do backend via `bitrix24-connector-settings?format=json`

### 4. URLs corretas no Bitrix24 Marketplace

```text
Install URL:      https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/bitrix24-install
Application URL:  https://emmelycloud.lovable.app/bitrix24  (frontend com tabs)
Settings Handler: Registado automaticamente via PLACEMENT_HANDLER na instalacao
```

## Detalhes Tecnicos

### Headers criticos para iframe (faltam atualmente)

```typescript
const htmlHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "... frame-ancestors *",
  "X-Frame-Options": "ALLOWALL",  // CRITICO - sem isto o iframe e bloqueado
};
```

### Ficheiros a modificar

1. `supabase/functions/bitrix24-install/index.ts` - Adicionar headers iframe, melhorar HTML
2. `supabase/functions/bitrix24-connector-settings/index.ts` - Adicionar `X-Frame-Options: ALLOWALL`, `frame-ancestors *`, logica de retorno `"successfully"`
3. `src/pages/Bitrix24App.tsx` - Remover logica de instalacao, manter apenas UI de gestao

### Ficheiros que NAO mudam

- `supabase/functions/bitrix24-events/index.ts` - Ja funciona
- `supabase/functions/bitrix24-send/index.ts` - Ja funciona
- `supabase/config.toml` - Ja tem verify_jwt = false
