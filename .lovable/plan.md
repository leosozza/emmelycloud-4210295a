

# Atualizar Roadmap com Novas Prioridades do Cliente

## Resumo

Atualizar a pagina `/roadmap` com os 9 blocos de tarefas enviados pelo cliente, organizados por fase e prioridade. Alguns itens ja existem parcialmente no roadmap actual e serao atualizados; outros sao novos.

## Mapeamento dos Itens

### Mover para "Concluido" (ja implementados)
- **Cobranças Automáticas** (2.4) — ja existe e esta concluido
- **Emmely Pay Stripe** (2.5) — ja existe e esta concluido
- **Agendamentos Bitrix24** (7.1) — acabamos de implementar o placement booking-tab

### Atualizar "Em Progresso"
- **Agentes IA para Atendimento** (4.1/4.2) — atualizar descricao para incluir resumos e analise de conversas, manter 40%
- **Bitrix24 Sync Bidirecional** (1.1/1.2/3.1/3.2) — atualizar descricao para incluir eliminacao de leads, transformacao pipelines→SPA, fluxos automaticos entre estruturas

### Adicionar Novos Modulos em "Em Progresso"
- **Reestruturacao Leads → Negocios** (1.1) — Eliminar etapa Lead no Bitrix, migrar para Negocios sem perda de dados — prioridade critica
- **Transformacao Pipelines → SPA** (1.2) — Nacionalidade, AR, Visto, Acao Judicial, etc. para Smart Process — prioridade critica
- **Envio Automatizado de Orcamento** (2.1) — Robot + fluxo para envio padronizado — prioridade alta
- **Comprovativo de Pagamento** (2.2) — Enviar confirmacao + controle ao cliente apos pagamento — prioridade alta
- **Relatorio Clientes em Atraso** (2.3) — Dashboard de facil visualizacao — prioridade alta
- **Fluxos Automaticos entre Pipelines/SPA** (3.1/3.2) — Parar movimentacao manual, validacoes de avanço — prioridade critica
- **Regras Operacionais Automaticas** (3.3) — Verificacao cada 60 dias, follow-ups automaticos — prioridade alta
- **Correcao Follow-ups** (9.1) — Revisar todas as mensagens automaticas de etapas — prioridade alta

### Adicionar em "Proximas Etapas"
- **Higienizacao da Base de Contactos** (5.1/5.2) — Limpeza gradual com criterios de seguranca — prioridade media
- **Controlo de Ativos em SPA** (6.1) — SPA dedicado para controlo de ativos — prioridade media
- **Controlo de Caixa Interno** (6.2) — Caixa Brasil (Erica), acesso restrito, lancamentos e saldo — prioridade alta
- **Dashboard BI Operacional** (8.1) — Leads recebidos, clientes respondidos, mensagens, ranking equipa — prioridade alta

## Ficheiros a Alterar

| Ficheiro | Accao |
|---|---|
| `src/pages/Roadmap.tsx` | Atualizar array `defaultPhases` com os novos modulos, prioridades e descricoes |

## Notas
- Itens que ja existem serao atualizados (descricao, progresso, prioridade)
- Novos itens terao `details` e `prompt` preenchidos para contexto
- A ordem dentro de cada fase respeita a prioridade (critica primeiro)
- Modulos ja concluidos (cobrancas, Stripe, agendamento) ficam na fase "Concluido"

