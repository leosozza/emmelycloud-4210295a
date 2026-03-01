

## Corrigir dessincronia entre webhook e teste de conexao Ollama

### Problema

O webhook (`ollama-url-webhook`) guarda a URL com `provider: "ollama"`, mas a funcao de teste (`ollama-test-connection`) procura com `provider: "qwen-local"`. Como os valores nao coincidem, a URL atualizada nunca e encontrada.

### Solucao

Alinhar ambas as funcoes para usar o mesmo provider. A correcao mais simples e alterar o webhook para usar `provider: "qwen-local"` (que e o valor que o teste e o frontend ja usam).

### Alteracao

**Ficheiro:** `supabase/functions/ollama-url-webhook/index.ts`
- Linha 59: alterar `provider: "ollama"` para `provider: "qwen-local"`

Apenas 1 linha a mudar. Nenhuma migracao de base de dados necessaria.

