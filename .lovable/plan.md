

# Plano: Criar Tabelas de Cadastro (sem autenticacao)

## Contexto

Criar as tabelas `clients`, `client_contacts`, `services` e `sef_locations` baseadas nas telas do Access, com interfaces de gestao. A autenticacao sera desativada por enquanto, pois o sistema podera ser usado como iframe dentro do Bitrix24.

---

## 1. Alteracoes no Banco de Dados

### Migracao SQL

Criar 4 novas tabelas com RLS **desativado** (sem autenticacao por enquanto):

**Tabela `clients`**
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| name | text | Sim |
| document_type | text | Nao |
| document_number | text | Nao |
| nationality | text | Nao |
| birth_date | date | Nao |
| nib | text | Nao |
| address | text | Nao |
| postal_code | text | Nao |
| freguesia | text | Nao |
| concelho | text | Nao |
| distrito | text | Nao |
| country | text (default 'PORTUGAL') | Nao |
| has_active_contract | boolean (default false) | Sim |
| notes | text | Nao |
| created_at / updated_at | timestamptz | Sim |

**Tabela `client_contacts`**
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| client_id | uuid (FK -> clients) | Sim |
| name | text | Sim |
| phone | text | Nao |
| mobile | text | Nao |
| email | text | Nao |

**Tabela `services`**
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| name | text | Sim |
| currency | text (default 'EUR') | Sim |
| value | numeric (default 0) | Sim |
| budget_details | text | Nao |
| contract_intro | text | Nao |
| contract_details | text | Nao |
| created_at / updated_at | timestamptz | Sim |

**Tabela `sef_locations`**
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| regional_direction | text | Sim |
| name | text | Sim |
| details | text | Nao |
| created_at / updated_at | timestamptz | Sim |

Adicionar coluna `client_id` (FK) na tabela `leads` para vincular leads a clientes.

RLS sera habilitado mas com politica permissiva (`true`) para todas as operacoes, permitindo acesso sem autenticacao. Quando decidir ativar auth, basta substituir por politicas baseadas em roles.

---

## 2. Remover Protecao de Rotas

- Alterar `App.tsx` para remover o componente `ProtectedRoutes` e tornar todas as rotas publicas
- Manter a pagina `/auth` disponivel mas sem redireccionamento forcado

---

## 3. Novas Paginas

### 3.1 Pagina de Clientes (`/clientes`)
- Tabela com lista de clientes e campo de pesquisa
- Dialog/modal para criar e editar cliente com todos os campos
- Seccao de contactos dentro do formulario (adicionar/remover)
- Badge indicando contrato ativo

### 3.2 Pagina de Servicos (`/servicos`)
- Lista de servicos com pesquisa
- Formulario com Nome, Moeda (EUR), Valor
- 3 abas: Detalhe Orcamento, Introducao Contrato, Detalhe Contrato

### 3.3 Pagina de SEF (`/sef`)
- Tabela com Direcao Regional e nome
- Formulario com campos de direcao regional (dropdown), nome e detalhes

---

## 4. Navegacao

Adicionar 3 novos itens ao sidebar (`AppSidebar.tsx`) num grupo "Cadastros":
- Clientes (icone Users)
- Servicos (icone Briefcase)
- SEF (icone MapPin)

Adicionar as rotas correspondentes no `App.tsx`.

---

## 5. Detalhes Tecnicos

- Migracao SQL unica para criar as 4 tabelas, triggers de `updated_at`, foreign keys e politicas RLS permissivas
- Componentes React com formularios usando React Hook Form + Zod para validacao
- TanStack React Query para operacoes CRUD
- Textarea simples para campos de texto longo (budget_details, contract_intro, contract_details)
- Arquivos novos: `src/pages/Clientes.tsx`, `src/pages/Servicos.tsx`, `src/pages/SEF.tsx`

