

## Robot Bitrix24 para Gerar Propostas Automaticamente

Criar um novo robot BizProc (`emmely_generate_proposal`) que recebe um ID de negocio/lead do Bitrix24, busca os dados do CRM, gera a proposta com PDF e devolve o link publico e URL do PDF ao Bitrix24.

### Fluxo

```text
Bitrix24 BizProc -> robot-handler (emmely_generate_proposal)
  -> Busca dados do Lead/Deal no Bitrix24 (nome, email, telefone, documento, morada)
  -> Busca servico associado (pelo titulo do deal ou campo personalizado)
  -> Cria proposta na tabela proposals (com accept_token)
  -> Chama proposal-pdf para gerar o HTML/PDF
  -> Devolve ao Bitrix24: proposal_url, pdf_url, proposal_id
  -> Bitrix24 grava o link no campo do negocio automaticamente
```

### 1. Novo Robot no Handler

Adicionar case `emmely_generate_proposal` em `supabase/functions/bitrix24-robot-handler/index.ts` com propriedades de entrada:

- `deal_id` ou `lead_id` -- ID da entidade no Bitrix24
- `entity_type` -- "deal" ou "lead" (default: "deal")
- `title` -- titulo da proposta (opcional, usa titulo do deal se vazio)
- `service_name` -- nome do servico para puxar valor/descricao (opcional)
- `payment_type` -- fixo/exito/hibrido/parcelado (default: fixo)
- `installments` -- numero de parcelas (default: 1)
- `value` -- valor manual (opcional, senao usa o do servico ou OPPORTUNITY do deal)
- `description` -- descricao manual (opcional)
- `conditions` -- condicoes (opcional)
- `valid_days` -- dias de validade (default: 30)

Valores de retorno ao Bitrix24:
- `proposal_url` -- link publico de aceite
- `pdf_url` -- URL do ficheiro HTML/PDF
- `proposal_id` -- ID interno da proposta
- `status` -- "created" ou "error"
- `error` -- mensagem de erro

### 2. Logica do Handler `handleGenerateProposal`

1. Buscar integracao Bitrix24 pelo `member_id`
2. Chamar API Bitrix24 (`crm.deal.get` ou `crm.lead.get`) para obter dados do cliente:
   - TITLE, OPPORTUNITY, CURRENCY_ID
   - CONTACT_ID -> `crm.contact.get` para nome, email, telefone, morada
3. Se `service_name` fornecido, buscar na tabela `services` para puxar valor e descricao
4. Criar caso (case) se nao existir, para vincular a proposta
5. Inserir na tabela `proposals` com todos os dados e `accept_token` gerado
6. Chamar a edge function `proposal-pdf` para gerar o ficheiro
7. Devolver `proposal_url`, `pdf_url` e `proposal_id` via `bizproc.event.send`

### 3. Registo do Robot no Install

Adicionar o robot `emmely_generate_proposal` no fluxo de instalacao (`bitrix24-install`) com os campos de propriedades adequados para que apareca no BizProc do Bitrix24.

### Ficheiros a alterar

- `supabase/functions/bitrix24-robot-handler/index.ts` -- adicionar handler `handleGenerateProposal` e case no switch
- `supabase/functions/bitrix24-install/index.ts` -- registar o novo robot com propriedades

### Sem alteracoes na base de dados

A tabela `proposals` ja tem todos os campos necessarios (accept_token, client_name, client_email, etc.). Nao e necessaria migracao.

### Detalhes Tecnicos

O handler faz chamadas encadeadas ao Bitrix24:
1. `crm.deal.get` com `ID` para obter dados do negocio
2. `crm.contact.get` com `ID` do contacto associado para nome/email/telefone
3. Insere proposta localmente
4. Chama `proposal-pdf` internamente via fetch
5. Retorna resultados ao BizProc

O link publico sera: `https://emmelycloud.lovable.app/proposta/{accept_token}`

