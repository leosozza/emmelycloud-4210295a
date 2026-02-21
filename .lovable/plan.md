

# Plano: Consolidar Instalacao do App Bitrix24

## Situacao Atual

A funcao `bitrix24-install` ja regista todos os modulos durante a instalacao:

| Modulo | Metodo API | Status |
|--------|-----------|--------|
| Conector WhatsApp/Instagram | `imconnector.register` | Registado |
| IM Bot (Emmely AI) | `imbot.register` | Registado |
| Eventos (8 eventos) | `event.bind` | Vinculados |
| Robots BizProc (4 robots) | `bizproc.robot.add` | Registados |
| Badges CRM (7 badges) | `crm.activity.badge.add` | Registados |
| CRM Tab (Lead Detail) | `placement.bind` | Registado |
| Botao "Devolver ao Bot" | `placement.bind` (IM_TEXTAREA) | Registado |
| Payment Handler | `sale.paysystem.handler.add` | Registado |
| Payment Systems (2) | `sale.paysystem.add` | Registados |

## Problemas Identificados

1. **Robot `emmely_execute_flow` em falta** -- existe no handler mas nao e registado na instalacao
2. **CRM Tab so regista Lead** -- falta Contacto, Negocio e SPA (ja documentado na memoria)
3. **Sem verificacao de sucesso consolidada** -- cada modulo falha silenciosamente sem impacto nos outros, mas nao ha resumo final
4. **Config merge parcial** -- so o bot_id e guardado no config; falta guardar IDs dos payment systems para referencia futura
5. **Scopes nao validados** -- nao ha verificacao se o app tem todos os scopes necessarios antes de tentar registar

## Alteracoes Propostas

### 1. Adicionar Robot `emmely_execute_flow` ao registo

Adicionar o quinto robot que ja tem handler implementado mas nao e registado na instalacao:

```
{
  CODE: "emmely_execute_flow",
  NAME: "Emmely: Executar Flow",
  PROPERTIES: {
    flow_id: { Name: "ID do Flow", Type: "string", Required: "Y" },
    phone: { Name: "Telefone", Type: "string", Required: "Y" },
    trigger_message: { Name: "Mensagem Trigger", Type: "string", Default: "iniciar" },
  },
  RETURN_PROPERTIES: {
    status: { Name: "Status", Type: "string" },
    conversation_id: { Name: "ID da Conversa", Type: "string" },
    flow_name: { Name: "Nome do Flow", Type: "string" },
    error: { Name: "Erro", Type: "string" },
  },
}
```

### 2. Registar CRM Tab em todas as entidades

Adicionar placements para Contacto, Negocio e SPA alem de Lead:

- `CRM_LEAD_DETAIL_TAB`
- `CRM_CONTACT_DETAIL_TAB`
- `CRM_DEAL_DETAIL_TAB`
- `CRM_DYNAMIC_DETAIL_TAB` (SPA)

### 3. Guardar resumo completo no config

Apos todos os registos, fazer merge no campo `config` com:

```json
{
  "bot_id": "10265",
  "connector_registered": true,
  "robots_registered": ["emmely_send_whatsapp", ...],
  "placements_registered": ["CRM_LEAD_DETAIL_TAB", ...],
  "paysystem_handler_registered": true,
  "installed_modules": ["connector", "bot", "robots", "badges", "crm_tabs", "paysystem"],
  "install_completed_at": "2026-02-21T..."
}
```

### 4. Adicionar verificacao de scopes

No inicio da instalacao, chamar `app.info` para verificar os scopes disponiveis e logar quais modulos podem ser registados:

```
Scopes necessarios: crm, imopenlines, imconnector, im, imbot, event, user, bizproc, pay_system, placement
```

Se faltar algum scope, o modulo correspondente e ignorado com log de aviso em vez de falhar.

## Detalhes Tecnicos

### Ficheiro alterado
- `supabase/functions/bitrix24-install/index.ts`

### Sequencia de execucao (sem alteracao)
1. Parse do payload OAuth
2. Upsert na tabela `bitrix24_integrations`
3. (NOVO) Verificacao de scopes via `app.info`
4. Registo do conector `imconnector.register`
5. Bind de eventos
6. Registo do IM Bot
7. Criacao do agente IA padrao
8. Registo de badges
9. Registo de robots (agora com 5 em vez de 4)
10. Bind de placements (agora com 4 CRM tabs + IM_TEXTAREA)
11. Registo do payment handler e payment systems
12. (NOVO) Merge final do config com resumo de todos os modulos
13. Retorno HTML com `BX24.installFinish()`

### Estimativa de impacto
- Sem breaking changes -- apenas adicoes
- A reinstalacao (resync) do app no Bitrix24 e necessaria para que os novos registos tomem efeito

