

## Problema
O simulador de Placement no `/bitrix24` tem um bug: quando seleccionas "Emmely AI — CRM Tab", **só aparece o campo Lead ID**. Mas no código, o `dealId` tem um valor padrão de `"10581"` (hardcoded). Como o `buildFormData` verifica `if (dealId)` primeiro, ele **sempre envia deal 10581** independentemente do que escreveres no campo Lead ID.

Por isso, ao colocar 23693 no campo, estavas a alterar o `leadId` mas o sistema usava o `dealId = "10581"` e mostrava a Ellem Kristier (que é o contacto do deal 10581).

## Solução

### Ficheiro: `src/pages/Bitrix24App.tsx`

1. **Adicionar campo Deal ID ao CRM Tab** (linhas ~3789-3793)
   - Quando `placementType === "crm-tab"`, mostrar **dois campos**: Deal ID e Lead ID
   - Adicionar lógica para limpar o outro campo quando um é preenchido (para evitar ambiguidade)

2. **Corrigir o valor padrão do dealId** (linha 3582)
   - Mudar de `useState("10581")` para `useState("")` — o valor padrão não deve ser um deal específico

3. **Ajustar a condição do buildFormData** (linha 3620)
   - A condição `if (dealId)` já está correcta, desde que o default seja vazio

### Resultado esperado
- Ao seleccionar "Emmely AI — CRM Tab", aparece campo Deal ID e Lead ID
- Ao escrever `23693` no Deal ID, o sistema envia correctamente `PLACEMENT: CRM_DEAL_DETAIL_TAB` com `ID: 23693`
- Se Deal ID estiver vazio, usa o Lead ID como fallback

