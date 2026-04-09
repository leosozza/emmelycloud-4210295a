

# Diagnóstico: A Mudança de Etapa NÃO Vem do Código

## Análise

Revisei todos os ficheiros envolvidos no fluxo do robot de proposta:

1. **`bitrix24-robot-handler`** — O `crm.deal.update` (linha 875) apenas actualiza os campos `UF_CRM_EMMELY_PROPOSAL_URL` e `UF_CRM_EMMELY_PROPOSAL_PDF`. **Não inclui `STAGE_ID`**, portanto não altera a etapa.

2. **`bitrix24-events`** — O evento `ONCRMDEALUPDATE` é enfileirado quando o deal é actualizado (o update dos campos UF dispara este evento).

3. **`bitrix24-worker` → `handleDealUpdate`** — Apenas verifica se o deal está na etapa WON para auto-charge. Se não está em WON, retorna imediatamente sem fazer nada. **Não altera a etapa.**

4. **`proposal-accept`** — Só muda a etapa quando o cliente **aceita** a proposta (e apenas se `accept_stage_id` estiver configurado). Na geração, não é chamado.

## Conclusão

**O código Emmely não muda a etapa do deal ao gerar a proposta.** A mudança para "negócio não fechado" está a ser causada por outra acção na **automação do Bitrix24** (BizProc/Workflow) — provavelmente há uma acção "Alterar Negócio" ou outra regra de automação configurada **depois** do robot "Gerar Proposta" no fluxo.

## O Que Verificar no Bitrix24

1. Abra o deal 21851 e veja o **histórico/timeline** — vai aparecer quem/o quê mudou a etapa
2. Vá a **CRM > Automação** na etapa onde o robot está configurado
3. Verifique se existe outra acção **após** o robot `emmely_generate_proposal` que muda a etapa (ex: "Alterar Negócio", "Mover para etapa")
4. Se encontrar essa acção, remova-a ou ajuste-a

Não há alteração de código necessária — o problema está na configuração do workflow no Bitrix24.

