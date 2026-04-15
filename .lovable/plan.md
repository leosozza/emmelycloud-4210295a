

## Plano: Usar `telephony.externalCall.searchCrmEntities` para resolver telefones

### Problema actual
Quando o Deal/Contact não tem telefone/email directo (ex: contacto criado via Open Channel com `@lid`), o CRM Tab falha na busca porque `extractPhones()` retorna vazio. O Bitrix24, internamente, pode ter o telefone associado via telephony — mas o nosso código não consulta essa fonte.

### Solução
Adicionar `telephony.externalCall.searchCrmEntities` como fonte adicional de resolução de telefones. Esta API do Bitrix24 faz matching fuzzy de telefones no CRM inteiro e retorna entidades (CONTACT, LEAD, COMPANY) vinculadas.

**Dois cenários de uso:**

1. **Conversa → CRM (reverso):** Quando temos uma conversa com `contact_phone` real mas sem vínculo ao CRM, usar `searchCrmEntities` para encontrar a entidade Bitrix correspondente
2. **CRM → Conversa (telefone do contacto via telephony):** Quando o Deal/Contact não retorna telefone via `crm.*.get`, buscar via a API de telephony que pode ter o número registado de outra forma

### Ficheiro a editar
`supabase/functions/bitrix24-crm-tab/index.ts`

### Alterações

**1. Nova função `findPhoneViaSearchCrmEntities`**
```typescript
async function findPhoneViaSearchCrmEntities(
  endpoint: string, token: string, phone: string
): Promise<{ entityType: string; entityId: string }[]> {
  const res = await callBitrix(endpoint, token, 
    "telephony.externalCall.searchCrmEntities", 
    { PHONE_NUMBER: phone });
  return (res?.result || []).map(r => ({
    entityType: r.CRM_ENTITY_TYPE,
    entityId: String(r.CRM_ENTITY_ID),
  }));
}
```

**2. Adicionar como passo de lookup (entre os passos 5 e 6 actuais)**

Quando todas as buscas anteriores falharam e temos `allPhones` (do contacto ou da conversa), chamar `searchCrmEntities` com cada telefone para encontrar entidades CRM que o Bitrix24 conhece mas que não estavam explícitas no Deal/Contact.

**3. Lookup reverso (conversa → CRM)**

Se temos uma conversa encontrada com `contact_phone` real (não `@lid`), e não encontramos o `bitrix_deal_id` — usar `searchCrmEntities` com esse telefone para vincular automaticamente a entidade CRM correcta.

**4. Persistir o vínculo**

Quando `searchCrmEntities` encontrar uma correspondência, gravar o `bitrix_deal_id` ou `bitrix_contact_id` no `bot_state` da conversa para que os lookups futuros sejam instantâneos.

### Detalhes técnicos
- A API requer scope `telephony` — verificar se a app Bitrix24 tem essa permissão
- A API faz matching fuzzy interno do Bitrix24, incluindo telefones adicionados via telephony, importações, etc.
- Retorna `CRM_ENTITY_TYPE` (CONTACT/LEAD/COMPANY) e `CRM_ENTITY_ID`
- Inserir como fallback, não como passo principal (para não adicionar latência quando os métodos existentes funcionam)

