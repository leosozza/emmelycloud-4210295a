

# Sistema de Agendamento Bitrix24 — Placement + Configuracoes

## Resumo

Criar um sistema completo de agendamento com 3 componentes:
1. **Aba de Configuracoes** na pagina `/configuracoes` para definir horarios disponiveis, intervalos e preferencias
2. **Edge Function `bitrix24-booking-tab`** que serve um placement interativo no CRM (Deal/Lead/Contact) com calendario e slots
3. **Registo do placement** no install e rebind

---

## 1. Nova Aba "Agenda" em Configuracoes

Adicionar uma nova tab `agenda` na pagina `Configuracoes.tsx` com os seguintes campos (guardados em `payment_gateway_config` com `gateway = 'booking'`):

- **Horario de trabalho**: Hora inicio (ex: 09:00), Hora fim (ex: 18:00)
- **Dias da semana**: Checkboxes para Seg-Dom (quais dias estao disponiveis)
- **Duracao padrao**: Dropdown 15min / 30min / 45min / 1h / 1h30 / 2h
- **Intervalo entre atendimentos**: Input em minutos (ex: 15min entre reunioes)
- **Tipo de reuniao padrao**: Presencial / Online / Ambos
- **Enviar link de reuniao online**: Toggle — quando activo, ao criar evento online no Bitrix24, cria automaticamente uma videoconferencia e envia o link
- **Titulo padrao do evento**: Template (ex: "Reuniao — {cliente}")
- **Responsavel padrao**: Selector de utilizador Bitrix24

| Ficheiro | Accao |
|---|---|
| `src/pages/Configuracoes.tsx` | Nova tab "Agenda" com `AgendaTab` |
| `src/components/configuracoes/AgendaTab.tsx` | **Novo** — Formulario de configuracao da agenda |

---

## 2. Edge Function `bitrix24-booking-tab`

Segue o padrao do `bitrix24-payment-tab` (HTML inline no iframe):

### Actions JSON (via query param `action`):
- `get_users` — lista utilizadores do Bitrix24 via `user.get`
- `get_config` — le config da tabela `payment_gateway_config` (gateway = 'booking')
- `get_availability` — chama `calendar.accessibility.get` para um utilizador num periodo de 30 dias e calcula slots livres com base na config (horario, intervalo, duracao)
- `create_event` — chama `calendar.event.add` com:
  - `crm_fields` vinculando ao Deal/Lead/Contact actual
  - `is_meeting: "Y"` e `attendees`
  - Se tipo = online, usa `meeting: { HOST_NAME, NOTIFY: true, MEETING_CREATOR: userId }` e adiciona link de videoconferencia via `im.videocall.create` ou `meeting.create` do Bitrix24

### UI do Calendario (HTML inline):
- Selector de responsavel (advogado/utilizador)
- Calendario mensal com navegacao
- Dias com disponibilidade marcados em verde, ocupados em cinza
- Ao clicar num dia, mostra slots disponiveis em cards clicaveis
- Formulario: titulo, tipo (presencial/online), descricao opcional
- Botao "Agendar" → cria evento → mostra confirmacao com link da reuniao (se online)
- Estilo consistente com os outros placements (dark mode support)

| Ficheiro | Accao |
|---|---|
| `supabase/functions/bitrix24-booking-tab/index.ts` | **Novo** — Edge function completa |

---

## 3. Registo do Placement

Registar "Emmely Agenda" em `CRM_DEAL_DETAIL_TAB`, `CRM_LEAD_DETAIL_TAB` e `CRM_CONTACT_DETAIL_TAB`:

| Ficheiro | Accao |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Adicionar `placement.bind` para os 3 placements com handler `bitrix24-booking-tab` |
| `supabase/functions/bitrix24-rebind-events/index.ts` | Adicionar os mesmos 3 placements no loop de rebind |

---

## Logica de Disponibilidade

```text
1. Le config: horario 09:00-18:00, duracao 30min, intervalo 15min
2. Chama calendar.accessibility.get para o mes seleccionado
3. Para cada dia util (segundo config de dias da semana):
   - Gera slots: [09:00, 09:45, 10:30, 11:15, ...] (duracao + intervalo)
   - Remove slots que colidem com blocos ocupados
4. Apresenta slots livres ao utilizador
```

## Logica de Reuniao Online

Ao criar evento com tipo "online":
1. Cria evento via `calendar.event.add` com `meeting.NOTIFY: true`
2. Adiciona descricao com link de videoconferencia do Bitrix24 (formato: `https://{domain}/online/{eventId}`)
3. O Bitrix24 envia automaticamente notificacao aos participantes com o link

