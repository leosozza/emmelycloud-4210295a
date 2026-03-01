

## Corrigir tela branca e adicionar extracção de texto de PDFs no Training

### Problema identificado

A pagina `/training` aceita ficheiros PDF no input (`.pdf` esta no `accept`), mas o codigo **nunca extrai o texto** dos PDFs. Na linha 260, apenas ficheiros de texto simples (`txt, md, csv, json, xml`) sao processados. PDFs sao enviados ao storage mas ficam com 0 chunks e conteudo vazio.

A tela branca pode ser causada por:
- Um erro nao capturado durante o upload de PDFs grandes
- O componente re-renderiza apos criar o documento e algo falha silenciosamente

### Solucao

**1. Criar edge function `parse-document` para extrair texto de PDFs**

Novo ficheiro: `supabase/functions/parse-document/index.ts`

- Recebe `file_path` (caminho no bucket `knowledge-files`) e `document_id`
- Faz download do ficheiro do storage
- Usa uma biblioteca Deno para extrair texto do PDF (ex: `pdf-parse` via esm.sh ou extracção basica de text streams)
- Actualiza o documento com o conteudo extraido e cria os chunks
- Retorna o texto extraido

**2. Modificar `src/pages/Training.tsx`**

- Apos upload de ficheiros PDF/DOCX ao storage, chamar a edge function `parse-document` para extrair o texto
- Adicionar try/catch mais robusto no loop de upload de ficheiros (linhas 248-274) para evitar crashes
- Tratar o caso de ficheiros binarios que nao podem ser lidos com `file.text()`
- Mostrar feedback visual durante a extracção (ex: status "A processar PDF...")

**3. Fluxo actualizado**

```text
Upload PDF -> Storage -> Chamar parse-document -> Extrair texto -> Criar chunks -> Status "ready"
```

Para ficheiros de texto simples (txt, md, csv, json, xml), o fluxo actual mantem-se (leitura directa no browser).

### Detalhes tecnicos

**Edge function `parse-document`:**
- Usa `pdf-parse` via `https://esm.sh/pdf-parse` para PDFs
- Para DOCX, extrai XML interno e limpa tags
- Fallback: se a extracção falhar, marca o documento como "ready" com 0 chunks mas sem crash
- Endpoint: POST com `{ file_path, document_id }`

**Alteracoes no Training.tsx:**
- Linha 259-263: Apos upload, verificar se o ficheiro e PDF/DOCX e chamar a edge function em vez de `file.text()`
- Adicionar estado `processingFiles` para mostrar que a extracção esta em curso
- Envolver todo o bloco de upload em try/catch para evitar tela branca

### Ficheiros a criar/editar

1. **Criar**: `supabase/functions/parse-document/index.ts` — edge function de extracção de texto
2. **Editar**: `src/pages/Training.tsx` — integrar chamada a edge function para PDFs e melhorar tratamento de erros
3. **Editar**: `supabase/config.toml` — NAO (configurado automaticamente)
