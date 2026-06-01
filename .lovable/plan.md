## Problema
No placement Bitrix24 (`bitrix24-crm-tab`), ao abrir o painel HSM e escolher um campo do CRM para preencher uma variável `{{n}}` do template, o dropdown mostra o **código interno** (`UF_CRM_1750957706981`, `UF_CRM_1742937147188`, …) em vez do **rótulo configurado** (ex.: "NIF", "Processo nº"). Além disso, ao trocar para o mesmo template novamente, a seleção é perdida — o usuário precisa reabrir a lista enorme e procurar o campo de novo.

Causa raiz (em `supabase/functions/bitrix24-crm-tab/index.ts`):

1. `ensureCrmFieldsLoaded()` chama apenas `crm.deal.fields` (ou lead/contact/company). Esse método devolve `title` vazio para a maioria dos campos personalizados, e o código cai no fallback `title = f.title || f.formLabel || k`, ou seja, **o próprio código `UF_CRM_…`**.
2. Após aplicar a escolha, o handler faz `sel.value = ''`, descartando o vínculo. Não há persistência por template.

## Mudanças (somente em `supabase/functions/bitrix24-crm-tab/index.ts`)

### 1. Carregar rótulos dos campos personalizados
Em `ensureCrmFieldsLoaded`, além de `crm.{entity}.fields`, chamar `crm.{entity}.userfield.list` (ou `userfieldconfig.list` quando for SPA) e construir um mapa `{ FIELD_NAME → LIST_COLUMN_LABEL || EDIT_FORM_LABEL || LIST_LABEL }`. Ao montar `CRM_FIELDS_LIST`, para qualquer chave que comece com `UF_CRM_` cujo `title` seja vazio/igual à própria chave, substituir pelo rótulo vindo do userfield (preferindo o idioma da interface via `BX24.getLang()`, com fallback para qualquer rótulo presente). A lista final continua `{ key, title }`, agora com `title` amigável.

```text
crm.deal.fields           → estrutura/types
crm.deal.userfield.list   → labels multilíngues dos UF_CRM_*
                            (para SPA: userfieldconfig.list com entityId=CRM_<typeId>)
```

### 2. Mostrar o rótulo no picker e manter chave como `value`
Em `loadCrmFieldsIntoPickers`, manter `option.value = f.key` e `option.textContent = f.title` (já existente), mas agora `f.title` será o nome amigável. Adicionar `option.title = f.key` para o usuário ver o código interno via tooltip.

### 3. Persistir escolha por (template, parâmetro)
Criar duas funções auxiliares usando `localStorage`:

```text
hsmBindKey(templateId)               → "emmely.hsmBindings.v1"
loadBindings(templateId): {idx: key} → {1: "UF_CRM_…", 2: "NAME"}
saveBinding(templateId, idx, key)
```

Alterações em `onHsmTemplateChange` (após criar inputs/pickers):
- Após `loadCrmFieldsIntoPickers()`, ler bindings salvos do template atual e, para cada índice `i` com binding, definir `picker.value = key`, preencher `input.value = getCrmFieldValue(key)` e chamar `renderHsmPreview()`.

Alterações no `picker.onchange`:
- **Não** zerar `sel.value` após aplicar — manter a seleção visível.
- Chamar `saveBinding(SELECTED_HSM.id, idx, key)`.
- Marcar o input como "vinculado a CRM" (atributo `data-bound-key`) para que, caso o usuário edite manualmente, o binding seja removido (`removeBinding` no `input.oninput`).

### 4. Pequena melhoria de UX
- Aumentar `max-width` do `<select>` do picker de `120px` para algo como `180px` para acomodar nomes mais longos.
- Adicionar um botão `×` minúsculo ao lado do picker para limpar o vínculo daquela variável (apaga binding + limpa input).

## Detalhes técnicos
- Sem mudanças no frontend Lovable, sem migração, sem alteração de schema.
- O endpoint `crm.<entity>.userfield.list` já existe no portal e usa o mesmo `BX24.callMethod` autenticado pelo iframe — não requer token novo.
- `localStorage` é escopado ao domínio do portal Bitrix24 (já que o iframe roda em `*.bitrix24.com`/`.pt`), então cada portal tem seu próprio mapeamento.
- Bindings são por `template.id` (Gupshup), portanto ao escolher o mesmo template em outro Deal, as variáveis virão pré-preenchidas com os valores **daquele** Deal (porque resolvemos `getCrmFieldValue(key)` no momento da seleção).

## Validação
1. Deploy de `bitrix24-crm-tab`.
2. No iframe: abrir um Deal, abrir o painel WhatsApp Oficial (HSM), escolher um template com 1+ variáveis.
3. Confirmar que o `<select>` mostra "NIF", "Processo nº", … em vez de `UF_CRM_…`.
4. Escolher um campo para `{{1}}`, fechar o painel, reabrir, escolher o mesmo template → `{{1}}` deve voltar a aparecer preenchido e o picker deve mostrar o campo selecionado.
5. Trocar de Deal e repetir → o binding persiste; o valor resolvido é o do Deal atual.

Pronto para aplicar?