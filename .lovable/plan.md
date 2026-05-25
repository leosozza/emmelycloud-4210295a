# Auto-resolver telefone do Deal/Lead no placement Bitrix24

## Problema
Hoje o `bitrix24-crm-tab` só extrai telefone de:
- A entidade do placement (Deal/Lead/Contact/Company) via `PHONE`
- Para Deals: apenas do `CONTACT_ID` principal

Quando o Deal não tem `CONTACT_ID` principal preenchido (mas tem contatos vinculados via `crm.deal.contact.items.get`), ou quando vem de um Lead convertido, o telefone não aparece e o campo manual é exigido — apesar do telefone existir no CRM.

## Solução
Tornar a resolução de telefone determinística e exaustiva no backend, eliminando o input manual sempre que houver qualquer telefone rastreável.

### Mudanças em `supabase/functions/bitrix24-crm-tab/index.ts`

1. **Deal (entityTypeNum === 2)**: além de `CONTACT_ID`, chamar:
   - `crm.deal.contact.items.get` → iterar todos os contatos vinculados, fazer `crm.contact.get` em cada e juntar `PHONE`
   - Se `deal.LEAD_ID` existir, fazer `crm.lead.get` e extrair `PHONE` do lead de origem
   - Se a empresa do deal (`COMPANY_ID`) existir e ainda não houver phone, fazer `crm.company.get` como último recurso

2. **Lead (entityTypeNum === 1)**: já funciona, mas adicionar fallback — se vazio e o lead tiver `CONTACT_ID`, buscar do contato vinculado.

3. **Contact (entityTypeNum === 3)**: se vazio, buscar deals vinculados via `crm.contact.deal.items.get` e tentar extrair phone dos deals.

4. **SPA / entidades dinâmicas (entityTypeNum >= 128)**: usar `crm.item.get` com `entityTypeId`, ler campos `contactIds`/`contactId` e iterar `crm.contact.get`.

5. **Logging**: registrar em `[CRM-TAB] phone resolution` quais fontes deram hit (deal, contact, linked-contacts, lead, spa) para diagnóstico futuro.

6. **UI**: manter o input manual apenas como fallback verdadeiro (quando `allPhones.length === 0` após todas as tentativas). Quando há phone resolvido, esconder completamente o bloco amarelo e usar `phones[0]` automaticamente no `startConversation`.

### Não muda
- Lógica do frontend já usa `PHONES[0]` quando disponível — basta o backend popular corretamente.
- Seleção de template HSM e demais fluxos permanecem iguais.
- Sem mudanças de schema.

## Resultado esperado
Ao abrir a aba no Bitrix24 em qualquer Deal/Lead/SPA que tenha telefone em si ou em qualquer entidade relacionada (contato principal, contatos vinculados, lead de origem, empresa), o telefone aparece automaticamente e o botão "Iniciar no WhatsApp" dispara sem pedir digitação.
