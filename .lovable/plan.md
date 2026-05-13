## Problema

O painel "Consulta IA" do placement Bitrix24 (`bitrix24-crm-tab`) chama `ai-playground`, que rotea para o Ollama remoto via Cloudflare Tunnel. Os modelos `qwen2.5vl:32b` e `qwen3.6:35b` excedem o limite de ~100s do Cloudflare Free Tunnel e devolvem **HTTP 524**, caindo no `fallback_message` → *"Desculpe, não consegui processar a sua mensagem."*

O modelo `llama3.2:3b` (Qwen Assistant) funciona normalmente nos logs.

## Mudança

Atualizar via migração SQL o `ai_model` dos 6 agentes pesados para `llama3.2:3b` (já provado funcional no servidor remoto), mantendo `ai_provider = qwen-local`:

| Agente | Modelo atual | Novo |
|---|---|---|
| Agente Master Jurídico | qwen2.5vl:32b | llama3.2:3b |
| Assistente de Atendimento Jurídico | qwen3.6:35b | llama3.2:3b |
| Emmely AI | qwen3.6:35b | llama3.2:3b |
| Especialista em Planejamento Previdenciário | qwen2.5vl:32b | llama3.2:3b |
| Especialista em Salário-Maternidade | qwen2.5vl:32b | llama3.2:3b |
| Especialista em Vendas | qwen2.5vl:32b | llama3.2:3b |

## Bónus opcional (UX)

Em `ai-playground`, melhorar a deteção do erro 524 do Cloudflare para devolver mensagem clara em vez do fallback genérico:

> "O servidor Ollama remoto não respondeu dentro do limite (Cloudflare 524). Use um modelo mais leve ou aumente recursos do servidor."

Assim, se no futuro voltarem a configurar modelo grande, percebem imediatamente a causa.

## Arquivos afetados

- Migração SQL: `UPDATE ai_agents SET ai_model = 'llama3.2:3b' WHERE id IN (...)`
- `supabase/functions/ai-playground/index.ts` — adicionar deteção `lower.includes("524") || lower.includes("timeout occurred")` no bloco de erros amigáveis (linhas 256-262).

## Pergunta antes de implementar

Confirmas `llama3.2:3b` para todos? Ou preferes outro modelo leve já instalado no Ollama (ex: `qwen2.5:7b`, `phi3:mini`)? Se não souberes o que está instalado, posso ir com `llama3.2:3b` que é o único confirmado pelos logs.