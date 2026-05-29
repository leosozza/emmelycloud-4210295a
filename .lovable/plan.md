## Problema

Na aba "Emmely AI" dentro de Negócios do Bitrix24, alguns clientes mostram **"sem contacto"** e o campo de envio de template HSM aparece como **"⚠ Nenhum telefone no CRM — insira manualmente"**, mesmo quando o **título do negócio já contém o número** (ex.: `+5581986748436 - WhatsApp`).

Isto acontece porque o `bitrix24-crm-tab` só procura telefone em campos estruturados (`PHONE`) do Deal, Contact, Lead e Company. Quando o negócio é criado automaticamente a partir de uma mensagem de WhatsApp recebida e ainda não tem Contacto vinculado (ou o Contacto vinculado não tem o telefone preenchido), nenhum número é encontrado — apesar de estar visível no título.

## Solução

Adicionar **um fallback final** em `supabase/functions/bitrix24-crm-tab/index.ts` que, quando `allPhones.length === 0` após todas as procuras atuais, extrai dígitos do título do negócio / item SPA / `PLACEMENT_OPTIONS.TITLE`.

### Lógica de extração

1. Concatenar fontes de texto disponíveis:
   - `entity.TITLE` (Deal clássico)
   - `entity.title` (SPA, via `crm.item.get`)
   - `PLACEMENT_OPTIONS.TITLE` (enviado pelo Bitrix no `body`)
   - `contactName` resolvido

2. Procurar padrão de telefone E.164/livre: capturar **sequências de 8–15 dígitos** (aceitando `+`, espaços, `-`, `()` entre eles), limpar para apenas dígitos.

3. Validar: comprimento entre 8 e 15, e descartar valores que parecem IDs/CEP/data (heurística simples: rejeitar se for exatamente 5–7 dígitos puros sem prefixo internacional reconhecível; aceitar se começa por `+`, `55`, `351`, `1`, `34`, `44`, etc., **OU** se tem ≥10 dígitos).

4. Adicionar via `addPhones("title", [...])` para que apareça também no debug `phoneSources`.

### Onde inserir

Logo após o bloco do "Last-resort title from PLACEMENT_OPTIONS" (linha ~1830) e antes do próximo passo da pipeline, ainda dentro do `try` do resolvedor de entidade.

### Efeito UX

- O cabeçalho passa a mostrar o número em vez de "sem contacto".
- O painel HSM deixa de exigir digitação manual; o select de template e o botão "Iniciar no WhatsApp" usam o número detectado.
- Nenhuma alteração noutros pontos do fluxo — `PHONES` continua a ser preenchido pela mesma variável `allPhones`.

## Risco

Baixo. Só atua quando `allPhones` está vazio (não sobrepõe dados reais do CRM). Se o título não contiver telefone válido, o comportamento atual (input manual) é preservado.

## Ficheiro

- `supabase/functions/bitrix24-crm-tab/index.ts` — adicionar bloco de fallback (~15 linhas) e deploy da função.
