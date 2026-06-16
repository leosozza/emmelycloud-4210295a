## Objetivo

O conector `emmely_connector` deve refletir **exatamente** o que o utilizador configurou no Contact Center de cada Open Line — nunca ativar em massa. A auditoria apenas reporta o estado real; a UI permite reaplicar registro (ícone/handler) sem mexer em ativação por linha.

## Mudanças

### 1. `bitrix24-worker/index.ts` — endpoint `connector_audit`
- Manter retorno por linha com `STATUS` real (`imconnector.status`) + `is_active` no DB.
- **Remover** qualquer auto-correção que ative conector em linhas onde o utilizador não ativou. A reconciliação passa a ser unidirecional: se Bitrix diz `STATUS:false`, marcar `bitrix24_channel_mappings.is_active=false` (DB segue Bitrix, nunca o contrário).
- Se uma linha tem `STATUS:true` no Bitrix mas não existe mapping no DB, criar o mapping com `is_active=true` (apenas registar o que já existe lá).
- Nunca chamar `imconnector.activate` a partir do worker.

### 2. `bitrix24-connector-settings/index.ts`
- Já está correto: só ativa quando o Bitrix faz POST com `PLACEMENT=SETTING_CONNECTOR` e `ACTIVE_STATUS` vindo do slider do utilizador.
- Ajuste pequeno: respeitar `ACTIVE_STATUS` recebido — se vier `"N"` / `false`, chamar `imconnector.activate` com `ACTIVE: 0` e marcar mapping `is_active=false`, em vez de sempre forçar `ACTIVE: 1`.

### 3. UI `src/pages/Integracoes.tsx` — card "Contact Center"
- Lista por linha: nome, status (verde = ativo no Bitrix, cinza = disponível mas inativo, vermelho = erro/conector não encontrado).
- Botão **"Auditar"** (chama `connector_audit`, só leitura).
- Botão **"Reaplicar registro"** (chama `bitrix24-rebind-events` — atualiza ícone/handler do conector, **não** mexe em ativação por linha).
- **Sem** botão "Ativar em todas as linhas". Texto explicativo: "A ativação por linha é feita pelo utilizador no Contact Center do Bitrix24."

## Critérios de aceitação

1. Hoje no portal de teste: WhatsApp BR continua ativo; Facebook/Instagram/WhatsApp/Aplicação Emmely cloud continuam disponíveis mas inativas até o utilizador ativar manualmente no Contact Center.
2. Rodar "Reaplicar registro" não altera a ativação de nenhuma linha.
3. Se o utilizador desativar uma linha no Contact Center, a próxima auditoria marca `is_active=false` no DB.
4. UI mostra estado real por linha sem oferecer ativação em massa.
