## Objetivo

Permitir que, ao escolher o provedor **Emmely Messages** na aba "Mensagem" do Bitrix24, o utilizador escreva uma sintaxe simples para disparar um template HSM aprovado (Gupshup/WhatsApp), com variáveis.

## Sintaxe suportada no campo de texto do Bitrix

**Disparar template:**
```
template: nome_do_template
var1: João Silva
var2: 2025-01-15
var3: https://emmelycloud.com/p/abc
```

Aceita variantes equivalentes (parser tolerante):
- `template:nome_do_template` (sem espaço)
- `Template: nome_do_template` (case-insensitive)
- Separador `|` numa linha: `template: saudacao | João | 15/01 | link`
- Variáveis podem ser `var1`, `1`, `{{1}}`, ou aparecer na ordem após `|`

**Texto livre (sem `template:`):**
- Se a janela de 24h estiver aberta → envia como mensagem normal
- Se fechada → retorna erro visível no log Bitrix com instrução para usar `template:`

## O que muda

### 1. `bitrix24-messageservice-send/index.ts`
Adicionar um parser do `MESSAGE_BODY`:

```text
parseEmmelyMessage(body) →
  { mode: "template", templateName, variables: string[] }
  ou
  { mode: "text", text }
```

Regras do parser:
- Procurar linha que começa por `template:` (case-insensitive)
- Capturar nome do template (tudo até nova linha ou `|`)
- Capturar variáveis: linhas `varN:` OU segmentos após `|` na mesma linha
- Ordenar variáveis por índice numérico

### 2. Encaminhamento para `message-send`
- **Modo template**: chamar `message-send` com `message_type: "template"`, `template_name`, `template_params: [...]`, `channel: "whatsapp"`
- **Modo texto**: comportamento atual (texto livre)

Verificar se `message-send` já suporta `message_type: "template"`. Se não, adicionar branch que chame diretamente `gupshup-send` com payload de template HSM.

### 3. Log e feedback no Bitrix
- Toda chamada grava em `bitrix24_debug_logs` com `event_type: "messageservice_send"` mostrando: modo detectado, template, variáveis, resposta da Gupshup
- Resposta ao Bitrix usa `STATUS: "delivered"` em sucesso ou `STATUS: "error", ERROR: "mensagem clara"` em falha (aparece no Bitrix junto à mensagem)

### 4. Documentação inline
Atualizar o `DESCRIPTION` do sender no `bitrix24-install`:
```
"WhatsApp via Emmely. Para template: 'template: nome | var1 | var2'. Texto livre só dentro da janela de 24h."
```
Reaparece automaticamente quando o utilizador clicar "Atualizar App" em `/integracoes`.

## Como o utilizador usa, passo a passo

1. Abre Negócio/Contacto no Bitrix → aba **Mensagem**
2. Seletor de provedor → **Emmely Messages**
3. No campo de texto escreve, por exemplo:
   ```
   template: convite_reuniao
   var1: João Silva
   var2: 28/05/2026 às 15h
   var3: https://meet.emmelycloud.com/abc
   ```
4. Clica enviar → Bitrix POST → edge function parseia → Gupshup envia HSM
5. Status volta para o Bitrix ("delivered" ou erro explícito)

## Fora deste plano (próximos passos possíveis)

- Widget próprio com dropdown dos templates aprovados (UX melhor que sintaxe textual)
- Auto-detecção de janela 24h e fallback automático texto→template
- Sincronização automática da lista de templates Gupshup para o Bitrix

## Arquivos afetados

- `supabase/functions/bitrix24-messageservice-send/index.ts` — parser + roteamento template/texto
- `supabase/functions/bitrix24-install/index.ts` — atualizar `DESCRIPTION` do sender (1 linha)
- (verificar) `supabase/functions/message-send/index.ts` ou `gupshup-send/index.ts` — confirmar suporte a `message_type: "template"`
