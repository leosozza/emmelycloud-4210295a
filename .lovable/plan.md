

# Corrigir erro de temperatura no Playground IA

## Problema

O Playground IA retorna "Desculpe, não consegui processar a sua mensagem" porque o agente selecionado tem `temperature: 1.2` configurado na base de dados, mas o modelo de IA utilizado (via Lovable AI gateway) apenas aceita valores entre 0 e 1.

O erro exacto nos logs:
> `"temperature" does not support 1.2 with this model. Only the default (1) value is supported.`

## Correção

Adicionar validação/clamp do valor de temperatura na edge function `ai-playground` antes de enviar ao provider, limitando o valor ao intervalo suportado [0, 1]:

```
temperature = Math.min(1, Math.max(0, agent.temperature || 0.7))
```

Isto garante que qualquer valor fora do intervalo é automaticamente ajustado sem erro.

## Ficheiro a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `supabase/functions/ai-playground/index.ts` | Clamp do `temperature` para o intervalo [0, 1] na linha 127 |

Tambem faz sentido aplicar a mesma correção na edge function `ai-process-message` e `chatbot-reply` caso usem temperatura directamente do agente.

