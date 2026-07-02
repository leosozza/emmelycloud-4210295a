## Plano

1. Corrigir o botão **Editar** da cobrança completa no Emmely Pay para salvar o plano inteiro, não só a primeira parcela.
   - Quando escolher 6x, recalcular as 6 parcelas.
   - Persistir no Bitrix os campos `UF_CRM_EMMELY_TOTAL_INSTALLMENTS`, `UF_CRM_EMMELY_INSTALLMENT_VALUE`, `UF_CRM_EMMELY_FIRST_DUE_DATE`, `UF_CRM_EMMELY_INSTALLMENT_INTERVAL`, método, entrada e total.
   - Recriar/atualizar a lista de cobranças para refletir o novo parcelamento em vez de continuar mostrando 1 parcela.

2. Manter a edição individual da parcela separada.
   - O botão de cada parcela continuará alterando apenas valor, vencimento e método daquela parcela.
   - O botão ao lado de **Criar Cobrança** continuará sendo a edição da cobrança inteira.

3. Corrigir a leitura via robots.
   - Garantir que o robot use `UF_CRM_EMMELY_TOTAL_INSTALLMENTS` como fonte do número de parcelas.
   - Aceitar fallback para campos antigos/alternativos caso o Bitrix esteja gravando em `UF_CRM_EMMELY_NEXT_DUE_DATE` ou campos equivalentes.
   - Evitar que uma property vazia ou padrão do BizProc sobrescreva o parcelamento salvo no negócio.

4. Validar com logs/retorno.
   - Conferir que, após editar para 6x, a aba mostra 6 parcelas.
   - Conferir que o robot gera a mesma quantidade de parcelas que está salva nos campos do negócio.