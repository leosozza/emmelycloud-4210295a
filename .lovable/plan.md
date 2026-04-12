

# Implementar Bitrix24 Booking API (booking.v1.*)

## Contexto

O sistema de agendamento atual (`bitrix24-booking-tab`) usa a **Calendar API** (`calendar.event.add`, `calendar.accessibility.get`) para criar eventos no calendário de um utilizador Bitrix24. A API nativa de **Booking** (`booking.v1.*`) é um módulo diferente — focado em reserva de **recursos** (salas, equipamentos, especialistas) com slots configuráveis, lista de espera e ligação a clientes CRM.

A implementação vai adicionar suporte ao módulo Booking como **modo alternativo** ao Calendar, permitindo ao utilizador escolher nas configurações se quer agendar via Calendar (atual) ou via Booking (recursos nativos do Bitrix24).

## Alterações

### 1. Migração — Configuração do modo de agendamento

Adicionar campo `booking_mode` à config da agenda (`payment_gateway_config` gateway=booking):
- `"calendar"` (padrão, comportamento actual)
- `"booking"` (novo, usa `booking.v1.*`)
- Adicionar `booking_resource_id` para guardar o recurso Bitrix24 selecionado

### 2. `src/components/configuracoes/AgendaTab.tsx` — Novo card "Modo de Agendamento"

Adicionar card com:
- **Toggle** entre modo "Calendar" e modo "Booking (Recursos)"
- Quando modo = "booking": mostrar selector de recursos Bitrix24 (carregados via `booking.v1.resource.list`)
- Botão "Criar Recurso" para criar um recurso no Bitrix24 caso não exista nenhum

### 3. `supabase/functions/bitrix24-booking-tab/index.ts` — Suporte dual Calendar/Booking

Novas actions JSON:
- `get_resources` — chama `booking.v1.resource.list` e retorna lista de recursos
- `create_resource` — chama `booking.v1.resource.add` para criar recurso "Emmely Agenda"
- `get_resource_slots` — chama `booking.v1.resource.slots.list` para obter disponibilidade nativa

Modificar action `create_event`:
- Se `booking_mode === "booking"`:
  - Usar `booking.v1.booking.add` com `resourceIds`, `datePeriod` (timestamps Unix + timezone)
  - Após criar, associar cliente CRM via `booking.v1.booking.client.set` com `type: {module: "crm", code: "CONTACT"}`
- Se `booking_mode === "calendar"` (ou não definido): manter comportamento actual com `calendar.event.add`

Modificar action `get_availability`:
- Se modo = "booking": usar `booking.v1.resource.slots.list` para obter slots disponíveis do recurso
- Se modo = "calendar": manter lógica actual com `calendar.accessibility.get`

### 4. HTML do calendário — Adaptar UI

- Carregar config para saber o modo
- Se modo "booking": esconder selector de utilizador (usa recurso), mostrar nome do recurso
- Adaptar `createBooking()` para enviar `resource_id` em vez de `user_id` quando em modo booking

## Ficheiros a alterar

| Ficheiro | Acção |
|---|---|
| `src/components/configuracoes/AgendaTab.tsx` | Adicionar card "Modo de Agendamento" com toggle e selector de recursos |
| `supabase/functions/bitrix24-booking-tab/index.ts` | Adicionar actions `get_resources`, `create_resource`; modificar `get_availability` e `create_event` para suportar `booking.v1.*` |

