

# Fix: Rota /bitrix24/propostas não funciona

## Problema
Na linha 93 de `Bitrix24App.tsx`, a lista `validViews` não inclui `"propostas"`. Qualquer rota não reconhecida cai no fallback `"dashboard"`.

## Correção

**Ficheiro:** `src/pages/Bitrix24App.tsx` (linha 93)

Adicionar `"propostas"` à array `validViews`:

```typescript
const validViews: AppView[] = ["dashboard", "agentes", "training", "flows", "playground", "chatia", "pagamentos", "relatorios", "baixa", "carteira", "configuracoes", "propostas"];
```

Uma única linha a alterar.

