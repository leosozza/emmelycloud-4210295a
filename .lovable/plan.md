

## Diagnóstico

O `bitrix24-worker` está completamente quebrado. Uma edição anterior removeu/corrompeu a estrutura principal do ficheiro:

1. **Loop de eventos perdido**: O código que busca eventos da tabela `bitrix_event_queue` e itera sobre eles (`for...of`) desapareceu. O bloco que processa eventos (linhas 839-916) ficou "solto" dentro do `try` do badge request, referenciando variáveis (`event`, `integration`, `processed`) que não existem no escopo atual.

2. **Erros confirmados nos logs**:
   - `ReferenceError: integration is not defined` (linha 778)
   - `ReferenceError: event is not defined` (linha 835)

3. **8 eventos parados na fila** (`bitrix_event_queue`) com status `pending` porque o worker crasha antes de os processar.

4. **Impacto no contrato**: Quando o Bitrix envia eventos `ONCRMDEALUPDATE` ou o robot `emmely_generate_contract` é acionado, o worker não consegue processar, impedindo a geração do contrato.

## Plano de Correção

### 1. Reconstruir o `bitrix24-worker` (ficheiro principal)

**Ficheiro**: `supabase/functions/bitrix24-worker/index.ts`

Restaurar a estrutura correta do `Deno.serve` handler:

```
Deno.serve → 
  ├── CORS check
  ├── Badge request check (body._badgeRequest) → return early
  ├── Fetch pending events from bitrix_event_queue (SELECT ... WHERE status='pending' ORDER BY created_at LIMIT 10)
  ├── let processed = 0
  ├── for (const event of events) {
  │     ├── Find integration by member_id
  │     ├── Domain fallback
  │     ├── Single-tenant fallback
  │     ├── switch(event.event_type) → handlers
  │     ├── Mark done
  │     └── processed++
  │   } catch → mark failed/retry
  └── Return { processed, total }
```

Mudanças concretas:
- Fechar o `try/catch` do badge request na linha 817 (após o `return`)
- Adicionar busca de eventos pendentes da `bitrix_event_queue`
- Envolver o código das linhas 839-916 dentro de um `for` loop com `event` e `integration` definidos
- Declarar `let processed = 0` e `events` antes do loop
- Mover `resolveIntegrationFromConversation` para fora do handler (nível de módulo)

### 2. Deploy e validação

- Deploy da edge function corrigida
- Verificar que os 8 eventos pendentes são processados
- Testar envio de mensagem WhatsApp → Bitrix → resposta do bot

## Ficheiros a editar

- `supabase/functions/bitrix24-worker/index.ts` — reconstruir a estrutura do handler principal

