

# Criar BizProc Robots para Mensagens e Pagamentos no Bitrix24

## Problema
O fluxo de instalacao (`bitrix24-install`) atualmente regista apenas o **imconnector** e os **eventos**, mas nao regista nenhum **robot BizProc**. Isso significa que os utilizadores do Bitrix24 nao conseguem usar automacoes de mensagens ou pagamentos nos workflows de CRM (leads/deals).

## O que sao BizProc Robots
Robots sao acoes automatizadas que os utilizadores do Bitrix24 podem arrastar para os workflows de CRM. Quando um lead/deal atinge determinada fase, o robot e acionado e envia um POST HTTP para o nosso backend, que processa a logica e devolve o resultado ao workflow.

## Robots a criar

### Mensagens (baseado no thothai)
1. **emmely_send_whatsapp** - "Emmely: Enviar WhatsApp"
   - Propriedades: phone (telefone), message (texto da mensagem)
   - Retorno: message_id, status, error
   - Acao: Envia mensagem via Callbell/Direct API

2. **emmely_send_instagram** - "Emmely: Enviar Instagram"
   - Propriedades: instagram_user (utilizador IG), message (texto)
   - Retorno: message_id, status, error
   - Acao: Envia mensagem via Instagram Direct

### Pagamentos (baseado no bitrix24-asaas-link)
3. **emmely_create_charge** - "Emmely: Criar Cobranca"
   - Propriedades: amount, currency (EUR/BRL), payment_method (card/pix/boleto), customer_name, customer_email, description
   - Retorno: charge_id, charge_status, payment_url, pix_code, error
   - Acao: Cria cobranca via Stripe (EUR) ou Asaas (BRL) usando o `payment-create` existente

4. **emmely_check_payment** - "Emmely: Verificar Pagamento"
   - Propriedades: charge_id
   - Retorno: status, paid_at, paid_value, error
   - Acao: Verifica status via `payment-status` existente

## Implementacao tecnica

### 1. Nova Edge Function: `bitrix24-robot-handler`
Recebe os eventos dos robots quando sao acionados no workflow do Bitrix24:
- Parse do payload (form-urlencoded ou JSON)
- Identifica o robot pelo `code`
- Executa a logica correspondente
- Responde ao Bitrix24 via `bizproc.event.send` com `EVENT_TOKEN` e `RETURN_VALUES`

Para mensagens, utiliza as funcoes existentes (`callbell-send` ou `instagram-send`).
Para pagamentos, chama internamente o `payment-create` e `payment-status` ja existentes.

### 2. Atualizar `bitrix24-install` 
Adicionar funcao `registerRobots()` que e chamada durante a instalacao:
- Deleta robots existentes (em caso de reinstalacao)
- Regista os 4 robots via `bizproc.robot.add`
- Cada robot aponta o HANDLER para `/functions/v1/bitrix24-robot-handler`
- Usa `USE_SUBSCRIPTION: "Y"` para que o workflow aguarde a resposta

### 3. Atualizar `supabase/config.toml`
Registar a nova funcao `bitrix24-robot-handler` com `verify_jwt = false`.

### Ficheiros a criar
- `supabase/functions/bitrix24-robot-handler/index.ts`

### Ficheiros a modificar
- `supabase/functions/bitrix24-install/index.ts` (adicionar `registerRobots()`)
- `supabase/config.toml` (registar nova funcao)

### Fluxo de execucao

```text
Bitrix24 Workflow (Lead/Deal avanca fase)
  |
  v
Robot "Emmely: Enviar WhatsApp" acionado
  |
  v
POST -> /functions/v1/bitrix24-robot-handler
  |
  +-- Parse: code=emmely_send_whatsapp, properties={phone, message}
  +-- Acao: POST -> /functions/v1/callbell-send
  +-- Resposta: bizproc.event.send(EVENT_TOKEN, {message_id, status})
  |
  v
Workflow continua com os valores retornados
```

### Escopo `bizproc`
O aplicativo no Bitrix24 precisa ter o escopo `bizproc` nas permissoes. Se nao tiver, o registo dos robots falhara com `insufficient_scope`. O utilizador precisara verificar isto nas configuracoes do aplicativo no Bitrix24.

