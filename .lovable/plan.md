
# Fluxo Completo: Central de Atendimento ate Caso Juridico

## Resumo

Implementar o fluxo completo e automatizado onde uma conversa na Central de Atendimento gera um Lead, passa pela triagem (identificando area juridica e motivo), avanca para proposta, o cliente aceita, assina o contrato, e o processo se torna um caso juridico ativo.

## O que ja existe

- Central de Atendimento com conversas (WhatsApp, Instagram, Email)
- Leads com Kanban e funil de estagios
- Criacao automatica de Caso ao avancar lead para estagios avancados
- Propostas com criacao de contrato ao aceitar
- Contratos com assinatura
- Casos juridicos

## O que falta (lacunas no fluxo)

1. **Conversa nao gera Lead** -- Nao existe botao na Central de Atendimento para converter uma conversa em Lead
2. **Triagem nao esta implementada** -- A pagina de Triagem esta vazia, sem funcionalidade
3. **Contrato assinado nao atualiza o Lead** -- Ao assinar um contrato, o lead deveria avancar para "fechado"
4. **Sem ligacao visual entre entidades** -- Falta rastreabilidade end-to-end

## Plano de Implementacao

### 1. Botao "Criar Lead" na Central de Atendimento

No painel de perfil do contacto (`ContactProfile.tsx`), adicionar um botao "Criar Lead a partir desta conversa" que:
- Pre-preenche o nome, telefone, email e origem (canal da conversa)
- Abre o formulario de Lead ou cria diretamente
- Vincula o `client_id` se existir

### 2. Triagem Integrada no LeadSheet

Em vez de uma pagina separada, integrar a triagem diretamente no detalhe do Lead (`LeadSheet.tsx`):
- Adicionar campos de selecao rapida para area juridica e urgencia
- Botao "Concluir Triagem" que move o lead de "triagem" para "proposta"
- Resumo das notas da conversa (se vinculada)

### 3. Atualizar Lead ao Assinar Contrato

No `Contratos.tsx`, ao assinar um contrato (`signMutation`):
- Buscar o caso associado ao contrato
- Buscar o lead associado ao caso
- Atualizar o estagio do lead para "fechado"
- Atualizar o status do caso para "em_andamento"

### 4. Conectar Conversa ao Lead

Adicionar coluna `conversation_id` na tabela `leads` (migracao) para rastrear a conversa que originou o lead.

## Detalhes Tecnicos

### Migracao de Base de Dados

```text
ALTER TABLE public.leads ADD COLUMN conversation_id uuid REFERENCES conversations(id);
```

### ContactProfile.tsx -- Botao Criar Lead

Adicionar na seccao "Cliente" um botao "Converter em Lead" que:
1. Navega para `/leads` com query params contendo os dados da conversa
2. Ou abre um dialog inline que insere o lead diretamente

### LeadSheet.tsx -- Triagem Inline

Adicionar seccao de triagem com:
- Select para area juridica (se ainda nao preenchida)
- Select para urgencia
- Textarea para notas de triagem
- Botao "Avancar para Proposta" que salva os campos e move o estagio

### Contratos.tsx -- signMutation Melhorado

```text
// Apos assinar contrato:
1. Buscar contract.case_id
2. Buscar case.lead_id
3. UPDATE leads SET funnel_stage = 'fechado' WHERE id = lead_id
4. UPDATE cases SET status = 'em_andamento' WHERE id = case_id
```

### Leads.tsx -- Receber Dados da Conversa

Adicionar `useSearchParams` para receber dados pre-preenchidos:
- `?from_conversation=ID&name=X&phone=Y&email=Z&origin=whatsapp`
- Auto-abrir o formulario com os campos pre-preenchidos

## Ordem de Execucao

1. Migracao: adicionar `conversation_id` a tabela leads
2. ContactProfile: botao "Criar Lead" que navega com dados pre-preenchidos
3. Leads: receber query params e pre-preencher formulario
4. LeadSheet: adicionar triagem inline (area juridica, urgencia, notas)
5. Contratos: atualizar lead e caso ao assinar contrato
6. Testar fluxo completo end-to-end
