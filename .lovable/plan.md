# Unificar botões de manutenção Bitrix24

Hoje existem 5 botões espalhados que executam manutenção da integração Bitrix24:

**Em `Bitrix24App.tsx` (dentro do iframe / página Configurações):**
1. Re-registar Bot → `bitrix24-install` (registo dos bots dos agentes)
2. Registar Eventos & Botões do Chat → `handleRebindEvents`
3. Re-sincronizar Conector → `onResync`
4. Reparar Campos e Robots → `bitrix24-install?action=repair_fields`

**Em `Integracoes.tsx` (Central de Integrações → CRM):**
5. Atualizar App → `bitrix24-install?action=resync`

Todos acabam por chamar variações do mesmo endpoint (`bitrix24-install`) e as ações são complementares, não conflituantes.

## Objetivo

Substituir os 5 botões por **um único botão "Atualizar Bitrix24"** que executa tudo em sequência, mantendo apenas "Testar Conexão" ao lado como diagnóstico.

## O que muda

### `src/pages/Integracoes.tsx` (aba CRM)
- Manter os dois botões atuais ("Testar Conexão" e "Atualizar App"), mas renomear "Atualizar App" para **"Atualizar Bitrix24"** e ampliar a ação para chamar em sequência:
  1. `bitrix24-install?action=resync` (conector + campos + placements)
  2. `bitrix24-install?action=repair_fields` (campos e robots)
  3. `bitrix24-reregister-bot` (re-registo dos bots dos agentes)
  4. Rebind de eventos/botões do chat (mesma rota que o botão "Registar Eventos" usa em Bitrix24App)
- Toast único no fim com resumo (ex.: "Bitrix24 atualizado: conector, campos, robots, bots e eventos re-registados") e mensagens de erro agregadas caso algum passo falhe (continua os restantes).

### `src/pages/Bitrix24App.tsx` (dentro do iframe)
- Remover os 4 botões individuais (Re-registar Bot, Registar Eventos & Botões, Re-sincronizar Conector, Reparar Campos e Robots) e a caixa de texto de resultados de cada um.
- Substituir por **um único botão "Atualizar Bitrix24"** com a mesma sequência acima, para o utilizador que abre o app dentro do Bitrix.
- Manter o botão "Actualizar Conectores" do cartão "Conector por Canal" — esse é outro contexto (recarrega a lista de conectores no dropdown, não é manutenção).

## Detalhes técnicos

- Criar um helper local `runFullBitrixRefresh()` (em cada página, para preservar o auth/BX24 do iframe em `Bitrix24App`) que executa os 4 passos em série num único `try` com contagem de sucessos/falhas.
- Cada passo é independente: se um falhar, os seguintes continuam; o resultado final lista quais passos correram OK.
- Estado único `refreshing: boolean` a substituir os antigos (`reregisteringBot`, `rebinding`, `loading` de resync, `repairingFields`, `resyncing`).
- Sem alterações em edge functions — apenas o frontend é reorganizado.

## Fora de âmbito
- Não mexer em "Testar Conexão" (é diagnóstico, não manutenção).
- Não mexer no "Actualizar Conectores" do cartão por-canal.
- Nenhuma alteração de backend/edge functions.
