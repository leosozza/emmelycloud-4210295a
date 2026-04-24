## Objetivo

Garantir que no `/chat` cada agente responde **como especialista da sua área**, citando e ancorando-se no **conhecimento vinculado** (coleções/documentos) e na **persona treinada** (`base_prompt`).

## Problemas atuais (confirmados por inspeção)

1. **RAG ausente** — `ai-playground` carrega sempre os 20 primeiros chunks (por `chunk_index`), ignorando a pergunta. Agentes com 98 ou 186 chunks usam apenas ~10% do conhecimento.
2. **`base_prompt` ignorado** — a persona gerada pelo treinamento (até 6 635 chars no Emmely AI) nunca chega ao modelo. Só vai o `system_prompt`.
3. **Conteúdo truncado** — `chunksToToon` corta cada chunk a 500 chars e remove vírgulas/quebras, perdendo nuances jurídicas.
4. **Sem ancoragem** — o modelo recebe contexto mas não é instruído a usá-lo prioritariamente nem a citá-lo.
5. **UI cega** — utilizador não sabe se o conhecimento está a ser usado nem quantos chunks foram consultados.

## Mudanças

### 1. `supabase/functions/ai-playground/index.ts` — RAG real + persona

- **Persona**: concatenar `base_prompt + system_prompt` (Persona vem antes das instruções), seguindo o padrão já usado no `ai-process-message`.
- **Pesquisa por relevância**: extrair última mensagem do utilizador e chamar o RPC já existente `search_chunks_fts(search_query, doc_ids, match_count=8)`. Fallback para os 8 primeiros chunks se a pesquisa não devolver nada (perguntas muito curtas/genéricas tipo "olá").
- **Sem TOON / sem truncar**: incluir o conteúdo completo dos chunks num bloco legível:
  ```
  --- BASE DE CONHECIMENTO (especialista nesta área) ---
  [Fonte 1] <conteúdo integral>
  [Fonte 2] <conteúdo integral>
  ...
  --- FIM ---
  ```
- **Instrução de ancoragem** acrescentada ao system prompt quando há conhecimento:
  > "Responde como especialista exclusivamente nesta área. Baseia as respostas na BASE DE CONHECIMENTO acima. Se a informação não estiver lá, diz que não tens essa informação em vez de inventar. Cita as fontes referindo `[Fonte N]` quando relevante."
- **Logs**: `console.log` com método (`fts`/`fallback`), nº de chunks, query, tamanho do contexto.
- Manter streaming, timeout 180s, tratamento 429/402/504 (já existe).

### 2. `src/pages/ChatIA.tsx` — feedback visual de conhecimento

- Carregar, ao listar agentes, contagens de docs e chunks vinculados (uma única query agregada).
- Na barra de info do modelo (acima das mensagens) acrescentar à esquerda:
  - 📚 **`N docs · M chunks`** quando o agente tem conhecimento.
  - Tooltip com nomes das primeiras coleções.
  - Ícone subtil quando o agente NÃO tem conhecimento (modo "generalista").

### 3. (Sem alterações de DB)

O RPC `search_chunks_fts` e a tabela `knowledge_chunks` já existem e estão a ser usados pelo `ai-process-message`. Não há migração nem nova tabela.

## Detalhes técnicos

- O bloco de persona é concatenado assim:
  ```
  <base_prompt>
  
  <system_prompt>
  
  --- BASE DE CONHECIMENTO ---
  ...
  --- FIM ---
  
  <regra de idioma automático>
  
  <regra de ancoragem (só se houver conhecimento)>
  ```
- A query FTS usa apenas a última mensagem `user`. Se for `< 3` palavras úteis, salta direto para o fallback sequencial (evita resultados ruidosos em saudações).
- Limite ajustável por constante (`RAG_TOP_K = 8`). Cada chunk normalmente ~1 000 chars → contexto ~8 KB, perfeitamente comportável para `qwen3.6:35b`.
- A contagem de docs/chunks no frontend usa duas queries paralelas com `count: "exact", head: true` por agente seleccionado (não por todos, para não sobrecarregar).

## Ficheiros a tocar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/ai-playground/index.ts` | RAG via FTS, persona, instrução de ancoragem, logs |
| `src/pages/ChatIA.tsx` | Badge de conhecimento, contagem de chunks/docs |

## Como testar

1. **Especialista em Salário-Maternidade** (186 chunks): perguntar *"Quem tem direito a salário-maternidade rural?"* → resposta deve citar `[Fonte N]` e basear-se no conteúdo vinculado, não em conhecimento genérico.
2. **Emmely AI** (0 chunks, 6 635 chars de persona): saudar → resposta deve refletir tom/identidade da Emmely (persona), sem referências externas.
3. **Qwen Assistant** (0 docs, persona mínima): comportamento de modelo cru, sem badge 📚.
4. **Pergunta fora do escopo** ao Especialista em Salário-Maternidade (ex: "qual é a capital da Austrália?") → deve recusar educadamente: *"Não tenho essa informação na minha base."*
5. Logs da edge function mostram: `[AI-PLAYGROUND] RAG: method=fts, chunks=8, query="salário-maternidade rural", ctx=7843 chars`.
6. Header do `/chat` mostra `📚 7 docs · 186 chunks` para o Especialista, nada para o Qwen Assistant.
