## Diagnóstico (a partir dos logs do edge function)

Ao abrir o deal 35241, a função `bitrix24-crm-tab` lança:

```
ERROR [CRM-TAB] CRM lookup error: ReferenceError: linkedContactName is not defined
    at index.ts:1842:13
```

Esse crash interrompe todo o pipeline depois da resolução de telefone. Por isso o frame mostra apenas "Cliente / sem contacto" e "Nenhuma conversa ativa", sem o seletor de templates nem dados do deal — o handler nunca chega a montar o HTML correto.

Adicionalmente, o log mostra:

```
phone resolution: { entityId: "35241", contactName: "", phones: [], sources: [], leadId: null, contactId: null }
```

ou seja, o `crm.deal.get` voltou sem `TITLE` populado (entity provavelmente `null`) e o deal não tem contacto/lead/empresa ligados. Mesmo após corrigir o crash, este deal não tem telefone no Bitrix → temos de cair na entrada manual.

## Correções

### 1. Corrigir o `ReferenceError`

`supabase/functions/bitrix24-crm-tab/index.ts` linha ~1929 referencia `linkedContactName` que nunca foi declarado (resíduo de refactor anterior). Substituir por uma variável local recolhida na resolução de contactos:

- Declarar `let linkedContactName = ""` no topo do bloco (junto de `contactName` e `allPhones`).
- Dentro de `fetchContactPhones`, quando obtemos `cName`, também guardar em `linkedContactName` (primeira ocorrência).
- Manter o fallback existente: `[linkedContactName, contactName].filter(Boolean)`.

### 2. Logar e diagnosticar o `entity` vazio do deal

Adicionar `console.warn` se `crm.deal.get` devolver `result` falso, para detectar mais facilmente quando o portal nega leitura do deal. Não muda comportamento.

### 3. Templates HSM acessíveis sem conversa ativa

O bloco `startConvHtml` já renderiza um `<select id="hsm-template-select">` mas o carregamento depende do `DOMContentLoaded` (`loadHsmTemplates`). Após corrigir o crash o selector aparecerá. Garantir também:

- Quando `needsManualPhone` é verdadeiro, o botão "Enviar Template" continua activo (o utilizador escreve o número manualmente).
- Atualizar o label do bloco amarelo para mencionar que se pode enviar template HSM imediatamente.

### 4. Capturar o título do deal mesmo sem contacto

Se `entity` for null ou sem `TITLE`, ler `PLACEMENT_OPTIONS` (já temos no body) e usar `options?.title` quando existir, para o header passar de "Cliente" para o nome do deal. Pequeno polish, melhora a UX.

## Ficheiros a editar

- `supabase/functions/bitrix24-crm-tab/index.ts` (todas as correções acima).

## Validação

1. Reabrir o iframe no deal 35241 e confirmar nos logs ausência de `ReferenceError`.
2. Confirmar que o header mostra o título do deal e que o `<select>` de templates HSM carrega.
3. Selecionar um template, inserir telefone manual e enviar — deve disparar `message-send` com `message_type: 'template'`.
