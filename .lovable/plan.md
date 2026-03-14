

## Plano: Melhorar a Tela de Configuração de Comissões

### Estado Actual

A configuração de comissões existe como um **Dialog pequeno** (`ComissaoRulesDialog`) acessível pelo botão "Regras" na tab Comissões. Funciona, mas é limitado:
- Não permite editar regras existentes (apenas adicionar e activar/desactivar)
- Não permite eliminar regras
- Não tem simulador de cálculo
- Sem feedback visual de qual regra se aplica a cada cenário

### O que será melhorado

Transformar o dialog actual numa tela mais completa e usável, mantendo-o como dialog (consistente com o fluxo actual) mas com funcionalidades adicionais:

1. **Edição inline** — clicar numa regra permite editar os campos directamente na tabela
2. **Eliminar regra** — botão de eliminar com confirmação
3. **Simulador de comissão** — campo "Valor da proposta" que mostra em tempo real qual regra se aplica e quanto seria a comissão (similar ao simulador de encargos de atraso já existente)
4. **Melhor layout** — separar regras activas de inactivas, mostrar resumo

### Ficheiros a modificar

| Ficheiro | Acção |
|----------|-------|
| `src/components/financeiro/ComissaoRulesDialog.tsx` | Reescrever com edição inline, eliminação, simulador |
| `src/hooks/useCommissions.ts` | Adicionar `useDeleteCommissionRule` |

### Detalhes técnicos

- Adicionar mutation `deleteCommissionRule` no hook
- Simulador: dado um valor e papel/área, iterar pelas regras activas e mostrar a que se aplica (respeitando `min_value`/`max_value`)
- Edição inline: ao clicar numa célula, transformar em input; ao sair, gravar via `useSaveCommissionRule`
- Layout: dialog `max-w-3xl` com duas secções — simulador no topo, tabela de regras em baixo

