

# Plano: Criar Tabelas de Cadastro baseadas no Access

## Resumo

Replicar as 3 telas do Access (Cadastro de Clientes, Cadastro de Servicos, Cadastro de SEF) no Emmely Cloud, criando as tabelas no banco de dados e as interfaces de gestao correspondentes.

---

## 1. Novas Tabelas no Banco de Dados

### Tabela `clients` (Cadastro de Cliente)
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| name | text | Sim |
| document_type | text (passaporte/bi/cc) | Nao |
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

### Tabela `client_contacts` (Sub-tabela de Contactos)
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| client_id | uuid (FK -> clients) | Sim |
| name | text | Sim |
| phone | text | Nao |
| mobile | text | Nao |
| email | text | Nao |

### Tabela `services` (Cadastro de Servicos)
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

### Tabela `sef_locations` (Cadastro de SEF)
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| regional_direction | text | Sim |
| name | text | Sim |
| details | text | Nao |
| created_at / updated_at | timestamptz | Sim |

---

## 2. Vincular Clientes aos Leads Existentes

A tabela `leads` existente sera vinculada a `clients` atraves de uma nova coluna `client_id` na tabela `leads`, permitindo que um lead seja associado a um cliente completo quando avanca no funil.

---

## 3. Interfaces (Paginas)

### 3.1 Pagina de Clientes (`/clientes`)
- Lista de clientes com pesquisa por nome
- Formulario de cadastro/edicao com todos os campos da imagem
- Sub-secao de contactos (adicionar/remover contactos por cliente)
- Indicador de contrato ativo

### 3.2 Pagina de Servicos (`/servicos`)
- Lista lateral de servicos com pesquisa
- Formulario com Nome, Moeda, Valor
- 3 abas: Detalhe Orcamento, Introducao Contrato, Detalhe Contrato (campos de texto rico)

### 3.3 Pagina de SEF (`/sef`)
- Lista com Direcao Regional e nome do SEF
- Formulario com nome, direcao regional (dropdown), e campo de detalhes

---

## 4. Seguranca (RLS)

- Admin: acesso total a todas as tabelas
- Advogado: leitura de clientes e servicos
- Comercial: CRUD em clientes, leitura de servicos e SEF
- Financeiro: leitura de clientes

---

## 5. Detalhes Tecnicos

- Migracao SQL para criar as 4 tabelas com RLS, triggers de `updated_at`, e foreign keys
- Novas rotas no `App.tsx`: `/clientes`, `/servicos`, `/sef`
- Links no sidebar (`AppSidebar.tsx`)
- Componentes React para cada pagina com formularios usando React Hook Form + Zod
- Queries com TanStack React Query para CRUD

