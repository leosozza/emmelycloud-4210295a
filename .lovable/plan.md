

# Plano de Implementacao: Fases 3, 4 e 5

## Fase 3: Pagina de Triagem Dedicada

A pagina de Triagem (`/triagem`) ja esta implementada com funcionalidade completa:
- KPI cards (pendentes, urgencia alta, SLA expirado)
- Tabela com leads no estagio "triagem"
- Sheet lateral com formulario de triagem (area juridica, urgencia, notas)
- Botao "Concluir Triagem e Avancar para Proposta"

**Esta fase esta CONCLUIDA.** Nao requer alteracoes adicionais.

---

## Fase 4: Rastreabilidade e Navegacao (Breadcrumbs e Links)

### 4.1 Componente EntityBreadcrumb reutilizavel

Criar um componente `EntityBreadcrumb` que mostra o caminho completo de uma entidade:

```text
Conversa > Lead > Caso > Proposta > Contrato
```

Cada item e um link clicavel que navega para a entidade correspondente. O componente recebe IDs opcionais e faz queries para obter os nomes.

### 4.2 Integrar breadcrumbs nas paginas

- **Caso (`Casos.tsx`)**: ao abrir detalhe de um caso, mostrar breadcrumb com Lead de origem (via `lead_id`) e link para conversa (via `lead.conversation_id`)
- **Proposta (`Propostas.tsx`)**: mostrar breadcrumb com Caso associado (via `case_id`) e Lead de origem
- **Contrato (`Contratos.tsx`)**: mostrar breadcrumb com Proposta (via `proposal_id`), Caso (via `case_id`) e Lead de origem
- **Lead (`LeadSheet.tsx`)**: ja tem link para caso associado; adicionar link para conversa de origem (via `conversation_id`)

### 4.3 Links bidirecionais nas tabelas

- Na tabela de Casos: coluna "Lead" clicavel que abre o LeadSheet ou navega para `/leads`
- Na tabela de Contratos: coluna "Proposta" e "Caso" clicaveis
- Na tabela de Propostas: coluna "Caso" clicavel

### Ficheiros a criar/modificar:
- Criar: `src/components/EntityBreadcrumb.tsx`
- Modificar: `src/pages/Casos.tsx` (adicionar breadcrumb no detalhe)
- Modificar: `src/pages/Propostas.tsx` (adicionar breadcrumb no detalhe)
- Modificar: `src/pages/Contratos.tsx` (adicionar breadcrumb no detalhe)
- Modificar: `src/components/leads/LeadSheet.tsx` (adicionar link para conversa)

---

## Fase 5: Autenticacao e Seguranca

### 5.1 O que ja existe

- Pagina `/auth` com login e registo funcional
- Hook `useAuth` para verificar sessao
- Tabela `profiles` com trigger `handle_new_user` (mas o trigger NAO esta registado na BD -- precisa ser criado)
- Tabela `user_roles` com enum `app_role` (admin, comercial, advogado, financeiro)
- Funcoes `has_role`, `is_admin`, `is_advogado`, `is_comercial`, `is_financeiro`
- Politicas RLS baseadas em roles ja definidas nas tabelas
- Politicas permissivas (`USING (true)`) adicionadas temporariamente para testes

### 5.2 Migracao de Base de Dados

1. **Criar trigger para auto-criacao de perfil**: O trigger `handle_new_user` existe como funcao mas NAO esta registado. Criar:

```text
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

2. **Remover politicas permissivas**: Eliminar todas as politicas "Allow all..." das tabelas `leads`, `cases`, `proposals`, `contracts` e `financial_records`. Isto activa as politicas baseadas em roles que ja existem.

3. **Adicionar politica de leitura para conversations e messages para utilizadores autenticados**: As conversas e mensagens actualmente usam `USING (true)` que permite acesso anonimo. Substituir por politicas para `authenticated`.

### 5.3 Proteccao de Rotas no Frontend

Modificar `AppLayout.tsx` para verificar autenticacao:
- Se o utilizador nao esta autenticado, redirecionar para `/auth`
- Mostrar loading spinner enquanto verifica sessao
- Adicionar botao de logout no `AppHeader`

### 5.4 Contexto de Autenticacao

Criar um `AuthProvider` ou integrar no `AppLayout`:
- Disponibilizar `user`, `session`, `role` via contexto
- Verificar role do utilizador via query a `user_roles`
- Condicionar visibilidade de menus/accoes com base no role

### 5.5 Atribuicao de Role Inicial

O primeiro utilizador registado deve receber o role `admin` automaticamente. Criar uma funcao de base de dados que:
- Verifica se existem utilizadores na tabela `user_roles`
- Se nao existir nenhum, atribui `admin` ao novo utilizador
- Caso contrario, nao atribui role (admin atribui manualmente)

### Ficheiros a criar/modificar:
- Criar: migracao SQL (trigger + remover politicas permissivas + politicas autenticadas)
- Modificar: `src/components/AppLayout.tsx` (proteccao de rotas)
- Modificar: `src/components/AppHeader.tsx` (botao logout + mostrar nome/role)
- Criar: `src/contexts/AuthContext.tsx` (contexto de autenticacao com role)
- Modificar: `src/App.tsx` (envolver com AuthProvider)

---

## Detalhes Tecnicos

### EntityBreadcrumb -- Estrutura

```text
Props:
  - conversationId?: string
  - leadId?: string
  - caseId?: string
  - proposalId?: string
  - contractId?: string

O componente faz queries para obter os nomes de cada entidade
e renderiza um breadcrumb horizontal com links:

Conversa: Maria Silva > Lead: Maria Silva > Caso: Cidadania > Proposta: Honorarios > Contrato
```

### Politicas RLS a remover (10 politicas)

```text
leads: Allow all read/insert/update/delete
cases: Allow all read/insert/update/delete
proposals: Allow all read/insert/update/delete
contracts: Allow all read/insert/update/delete
financial_records: Allow all read/insert/update/delete
```

### Politicas RLS a adicionar

```text
-- Conversations e Messages: acesso para authenticated
conversations: SELECT/INSERT/UPDATE para authenticated
messages: SELECT/INSERT para authenticated
```

### Proteccao de Rotas

```text
AppLayout verifica useAuth():
  - loading -> Spinner
  - !session -> Navigate to /auth
  - session -> Render Outlet
```

### Ordem de execucao

1. Fase 4 -- Breadcrumbs (sem dependencias, pode ser feito primeiro)
2. Fase 5 -- Migracao BD (trigger + remover politicas permissivas)
3. Fase 5 -- Proteccao de rotas e contexto de autenticacao
4. Fase 5 -- Logout e UI de roles no header
5. Teste completo end-to-end com login

