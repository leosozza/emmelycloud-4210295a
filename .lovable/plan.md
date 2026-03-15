

## Cancelamento de Contrato com Devolução e Motivo

### Problema
Atualmente, o cancelamento de contrato apenas muda o status para "cancelado" sem registar se houve devolução de valores ou o motivo do cancelamento. O utilizador precisa desta informação para controlo financeiro e auditoria.

### Alterações

#### 1. Migração SQL — Novos campos na tabela `contracts`
Adicionar 3 colunas:
- `cancelled_at` (timestamptz, nullable) — data do cancelamento
- `cancel_reason` (text, nullable) — motivo do cancelamento
- `refund_amount` (numeric, nullable, default 0) — valor devolvido

```sql
ALTER TABLE public.contracts 
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN refund_amount NUMERIC DEFAULT 0;
```

#### 2. Dialog de Cancelamento — `src/pages/Contratos.tsx`
Substituir a chamada directa `cancelMutation.mutate(c.id)` por um modal de cancelamento que pede:
- **Motivo** (select): "Desistência do cliente", "Incumprimento", "Acordo mútuo", "Erro administrativo", "Outro"
- **Houve devolução?** (switch/checkbox)
- **Valor devolvido** (input numérico, visível apenas se sim)
- **Notas adicionais** (textarea opcional)

O modal envia update com: `status: "cancelado"`, `cancelled_at: now()`, `cancel_reason`, `refund_amount`.

#### 3. Tabela — Mostrar info de cancelamento
Na lista de contratos, quando o status é "cancelado":
- Mostrar o motivo no hover/tooltip ou numa coluna extra
- Se houve devolução, mostrar badge "Devolvido: €X"

#### 4. CarteiraAccessView — Botão de Cancelamento (`src/pages/Bitrix24App.tsx`)
Na vista expandida de cada serviço/caso, ao lado do botão "Baixa" nas parcelas, adicionar um botão "Cancelar Contrato" ao nível do contrato (não da parcela). Ao cancelar:
- Abre o mesmo modal de cancelamento
- Atualiza o contrato para "cancelado"
- Marca parcelas pendentes como "cancelada" (se o enum permitir, senão mantém pendente com nota)

### Ficheiros alterados
- **Migração SQL**: nova migração para os 3 campos
- **`src/pages/Contratos.tsx`**: dialog de cancelamento + exibição de motivo/devolução
- **`src/pages/Bitrix24App.tsx`**: botão de cancelar contrato na CarteiraAccessView com o mesmo dialog

