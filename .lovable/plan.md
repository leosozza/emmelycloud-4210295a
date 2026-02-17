
# Correcoes e Melhorias no Fluxo Lead -> Proposta -> Contrato -> Caso

## Resumo

O fluxo comercial completo tem lacunas que impedem a jornada natural do cliente. Este plano corrige a conectividade entre os modulos e resolve bugs identificados durante os testes.

## Problemas Identificados

1. **Formularios nao resetam estado** -- ContratoForm e PropostaForm usam `useState` com valor inicial fixo, entao ao fechar e reabrir para "Novo", mantem os dados do ultimo registo editado.
2. **Fluxo Lead para Caso desconectado** -- Quando um lead avanca no funil para "Contrato" ou "Fechado", nao e criado automaticamente um Caso juridico.
3. **Proposta exige Caso, mas Lead nao cria Caso** -- Para criar uma Proposta, e obrigatorio selecionar um Caso. Mas nao existe forma de criar um Caso a partir de um Lead diretamente.
4. **Erro de RLS ao testar sem autenticacao** -- As tabelas estao protegidas por politicas de seguranca, o que e correto, mas impede testes sem login.

## Plano de Implementacao

### 1. Corrigir reset de estado nos formularios

**Ficheiros:** `ContratoForm.tsx`, `PropostaForm.tsx`

Adicionar `useEffect` que reseta os campos quando o dialog abre/fecha ou quando o registo de edicao muda. Atualmente os `useState` so inicializam uma vez, entao reabrir o formulario mantem dados antigos.

### 2. Criar Caso automaticamente ao avancar Lead no funil

**Ficheiro:** `src/pages/Leads.tsx`

Quando o utilizador move um lead para o estagio "contrato" (ou outro estagio avancado como "proposta"), o sistema:
- Verifica se ja existe um Caso associado ao lead
- Se nao existir, cria automaticamente um Caso com:
  - Titulo baseado no nome do lead
  - Area juridica do lead
  - `lead_id` apontando para o lead
  - Status "aberto"
- Exibe uma notificacao: "Caso criado automaticamente"

### 3. Adicionar botao "Criar Proposta" no detalhe do Lead

**Ficheiro:** `src/components/leads/LeadSheet.tsx`

Quando o lead esta nos estagios "proposta" ou adiante:
- Mostrar botao "Criar Proposta" que:
  - Primeiro verifica/cria o Caso associado ao lead
  - Navega para `/propostas` com o caso pre-selecionado (via query param ou state)
  
Alternativa mais simples: adicionar um botao que abre o formulario de proposta diretamente no LeadSheet, com o caso ja associado.

### 4. Melhorar a ligacao Proposta aceita -> Contrato

**Ficheiro:** `src/pages/Propostas.tsx`

Ja existe a logica (linhas 93-101) mas falta:
- Atualizar o estagio do lead associado ao caso para "contrato" automaticamente
- Mostrar link para o contrato criado na notificacao

### 5. Adicionar link de navegacao entre entidades

**Ficheiros:** `LeadSheet.tsx`, `Propostas.tsx`, `Contratos.tsx`, `Casos.tsx`

Adicionar links clicaveis entre entidades relacionadas:
- No Lead: link para o Caso associado (se existir)
- No Caso: link para o Lead de origem
- Na Proposta: link para o Caso
- No Contrato: link para a Proposta e para o Caso

## Detalhes Tecnicos

### Reset de formularios (ContratoForm e PropostaForm)

Substituir `useState(contrato?.field)` por um `useEffect` que atualiza os estados quando a prop `contrato`/`proposta` muda:

```text
useEffect(() => {
  setProposalId(contrato?.proposal_id || "");
  setCaseId(contrato?.case_id || "");
  // ... demais campos
}, [contrato, open]);
```

### Criacao automatica de Caso

Na mutacao `moveStageMutation` em `Leads.tsx`, antes de atualizar o estagio:

1. Buscar se existe caso com `lead_id` = lead.id
2. Se nao existir e o estagio for >= "proposta", criar caso via `supabase.from("cases").insert({...})`
3. Invalidar queries de casos

### Nenhuma alteracao de base de dados necessaria

A tabela `cases` ja possui o campo `lead_id` que permite a ligacao.

## Ordem de Execucao

1. Corrigir reset dos formularios (ContratoForm, PropostaForm)
2. Implementar criacao automatica de Caso ao avancar Lead
3. Adicionar botao "Criar Proposta" no LeadSheet
4. Melhorar feedback e links de navegacao entre entidades
