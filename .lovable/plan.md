

## Extracção inteligente de PDFs com fallback IA

### Logica de decisao (2 passos)

```text
PDF recebido
    |
    v
Passo 1: Parsing local (gratis, rapido)
    - Extrai texto dos blocos BT/ET do PDF
    - Se texto > 100 caracteres -> USAR este texto (sem chamar IA)
    |
    v
Passo 2: Texto curto ou vazio?
    - Indica PDF digitalizado, scan, ou conteudo em imagens
    - Envia o PDF (base64) ao Gemini Flash com prompt de visao
    - IA extrai texto via OCR e descreve graficos/tabelas
```

### Quando a IA e chamada (e quando NAO e)

| Tipo de PDF | Parsing local | Chama IA? | Custo |
|---|---|---|---|
| Texto normal (contratos, manuais) | Funciona | NAO | Zero |
| Texto com fontes complexas | Funciona parcialmente | Talvez (se < 100 chars) | Baixo |
| PDF digitalizado (scan) | Falha (0 chars) | SIM | Normal |
| PDF com graficos/tabelas | Texto OK, graficos ignorados | NAO por defeito | Zero |

**Nota importante:** PDFs que tem texto normal MAS tambem graficos -- o parsing local extrai o texto mas ignora os graficos. Se o utilizador quiser que graficos sejam sempre descritos, podemos adicionar uma opcao "Extraccao avancada" que forca o uso da IA.

### Implementacao

**Ficheiro: `supabase/functions/parse-document/index.ts`**

1. Manter as funcoes actuais `extractPdfText` e `extractDocxText` como primeira tentativa
2. Adicionar funcao `extractWithAI(blob, ext)`:
   - Converte ficheiro em base64
   - Chama Lovable AI Gateway (`google/gemini-2.5-flash`) com o PDF inline
   - Prompt: "Extrai todo o texto. Descreve imagens, graficos e tabelas em detalhe."
   - Timeout de 60 segundos
   - Limite de 10MB para envio ao AI
3. Logica condicional:
   - Se parsing local retorna > 100 caracteres -> usar resultado local
   - Se parsing local retorna <= 100 caracteres -> chamar IA como fallback
   - Em caso de erro na IA -> manter resultado local (mesmo que vazio)

**Ficheiro: `src/pages/Training.tsx`**

- Integrar chamada a edge function para PDFs/DOCX (ja previsto no plano anterior)
- Adicionar try/catch robusto para evitar tela branca
- Mostrar feedback visual durante processamento

### Detalhes tecnicos

A chamada ao Lovable AI Gateway usa o `LOVABLE_API_KEY` (ja configurado automaticamente):

```text
POST https://ai.gateway.lovable.dev/v1/chat/completions
{
  model: "google/gemini-2.5-flash",
  messages: [
    { role: "user", content: [
      { type: "text", text: "Extrai todo o texto..." },
      { type: "image_url", url: "data:application/pdf;base64,..." }
    ]}
  ]
}
```

Tratamento de erros 429 (rate limit) e 402 (creditos) com fallback gracioso.

### Ficheiros a editar

1. **Editar**: `supabase/functions/parse-document/index.ts` -- adicionar `extractWithAI` e logica condicional
2. **Editar**: `src/pages/Training.tsx` -- integrar chamada a edge function e corrigir crash

