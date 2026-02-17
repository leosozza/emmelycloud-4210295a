

# Jornada Completa: Leads + Casos + Propostas + Contratos

## Resumo

Implementar os 4 modulos core que formam a jornada ponta a ponta do cliente: desde a entrada como Lead ate a assinatura do Contrato. A base de dados ja esta pronta com todas as tabelas, enums, e RLS necessarias.

---

## 1. Leads (Formulario + Funil Kanban + Ficha)

### 1.1 Pagina de Leads com Funil Kanban

Substituir o placeholder `src/pages/Leads.tsx` por uma interface completa com duas vistas:

- **Vista Kanban** (default): Colunas por `funnel_stage` (lead, triagem, proposta, analise, contrato, financeiro, fechado). Cada card mostra nome, origem, area juridica, SLA com cores (verde/amarelo/vermelho), e ai_score.
- **Vista Lista**: Tabela com ordenacao e filtros por origem, area juridica, e estagio.
- **Toggle** entre as duas vistas no header.

### 1.2 Formulario de Leads (Dialog)

Dialog modal para criar/editar leads com campos:
- Nome, Email, Telefone, Pais
- Origem (select com enum `lead_origin`)
- Area Juridica (select com enum `legal_area`)
- Urgencia (normal/alta/critica)
- Notas
- O SLA e definido automaticamente pelo trigger existente no backend

### 1.3 Ficha do Lead (Sheet lateral)

Ao clicar num card/linha, abre um Sheet lateral com:
- Dados completos do lead
- Indicador visual de SLA (tempo restante)
- AI Score e viabilidade
- Historico de alteracoes (updated_at)
- Botoes para mover de estagio, editar, eliminar

### Ficheiros novos:
- `src/components/leads/LeadKanbanBoard.tsx` - vista Kanban
- `src/components/leads/LeadCard.tsx` - card individual
- `src/components/leads/LeadForm.tsx` - formulario dialog
- `src/components/leads/LeadSheet.tsx` - ficha lateral
- `src/components/leads/LeadListView.tsx` - vista tabela

### Ficheiro editado:
- `src/pages/Leads.tsx` - pagina principal com toggle de vista

---

## 2. Casos Juridicos (CRUD com fichas)

Substituir o placeholder `src/pages/Casos.tsx` por uma interface completa:

### 2.1 Lista de Casos
- Tabela com colunas: titulo, area juridica, status (badge colorido), advogado atribuido, lead associado, data
- Filtros por status (`case_status` enum) e area juridica
- Barra de pesquisa

### 2.2 Formulario de Caso (Dialog)
- Titulo, Descricao, Area Juridica (select)
- Status (select com enum `case_status`)
- Lead associado (select dos leads existentes)
- Advogado atribuido (select dos profiles)
- Viabilidade, Notas internas

### 2.3 Ficha do Caso (Sheet)
- Dados completos
- Lead associado (link)
- Propostas vinculadas (lista)
- Contratos vinculados (lista)

### Ficheiros novos:
- `src/components/casos/CasoForm.tsx`
- `src/components/casos/CasoSheet.tsx`

### Ficheiro editado:
- `src/pages/Casos.tsx`

---

## 3. Propostas (Criacao + Status)

Substituir o placeholder `src/pages/Propostas.tsx`:

### 3.1 Lista de Propostas
- Tabela: titulo, caso associado, valor formatado (EUR), tipo pagamento, parcelas, status (badge), validade
- Filtros por status (`proposal_status` enum)

### 3.2 Formulario de Proposta (Dialog)
- Titulo, Caso associado (select dos casos)
- Valor, Tipo de pagamento (select `payment_type`)
- Numero de parcelas
- Condicoes (textarea)
- Validade
- Status

### 3.3 Acoes rapidas
- Botoes para mudar status: Enviar, Aceitar, Recusar
- Ao aceitar, opcao de gerar contrato automaticamente

### Ficheiros novos:
- `src/components/propostas/PropostaForm.tsx`

### Ficheiro editado:
- `src/pages/Propostas.tsx`

---

## 4. Contratos (Upload + Status)

Substituir o placeholder `src/pages/Contratos.tsx`:

### 4.1 Lista de Contratos
- Tabela: proposta associada, caso associado, status (badge), data inicio, data expiracao, data assinatura
- Filtros por status (`contract_status` enum)

### 4.2 Formulario de Contrato (Dialog)
- Proposta associada (select das propostas aceitas)
- Caso associado (select)
- Data inicio, Data expiracao
- Notas
- URL do ficheiro (input texto por agora, upload futuro)

### 4.3 Acoes
- Marcar como assinado (atualiza `signed_at` e status)
- Cancelar contrato

### Ficheiros novos:
- `src/components/contratos/ContratoForm.tsx`

### Ficheiro editado:
- `src/pages/Contratos.tsx`

---

## 5. Atualizacao do Roadmap

Atualizar `src/pages/Roadmap.tsx` para refletir o progresso:
- Formulario de Leads: 100%
- Funil Kanban: 100%
- Ficha do Lead: 100%
- Casos Juridicos: 100%
- Propostas: 100%
- Contratos: 100%

---

## Detalhes Tecnicos

### Backend
- **Sem alteracoes de schema**: todas as tabelas (`leads`, `cases`, `proposals`, `contracts`) ja existem com os campos necessarios
- **Enums disponiveis**: `funnel_stage`, `lead_origin`, `legal_area`, `case_status`, `proposal_status`, `contract_status`, `payment_type`
- **RLS ja configurado**: policies por role (admin, advogado, comercial, financeiro)

### Frontend
- **React Query** (`@tanstack/react-query`) para fetch, mutations, e cache
- **Componentes shadcn/ui**: Table, Dialog, Sheet, Select, Badge, Button, Input, Textarea, Tabs
- **Supabase client** existente para todas as operacoes CRUD
- **Padroes existentes**: seguir o mesmo padrao de `Clientes.tsx` (query + mutation + dialog form)
- **SLA visual**: calculo client-side comparando `sla_expires_at` com `now()` para cores verde/amarelo/vermelho

### Ficheiros totais
- **8 novos**: componentes em `src/components/leads/`, `src/components/casos/`, `src/components/propostas/`, `src/components/contratos/`
- **5 editados**: `Leads.tsx`, `Casos.tsx`, `Propostas.tsx`, `Contratos.tsx`, `Roadmap.tsx`

