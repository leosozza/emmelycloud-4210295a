

# Correção do PDF de Propostas — Título com Nome do Cliente + Layout Dinâmico

## Problemas Encontrados

1. **Layout dinâmico perde título e validade** — No path de `layout_blocks` (linha 153-185), o código primeiro tenta inserir o título entre o header e os restantes blocos com manipulação de string (substring/split) que é frágil, e depois **sobrescreve** o HTML completo com uma versão simples que não inclui o título nem a validade (linha 180-185).

2. **Título não inclui nome do cliente** — O título da proposta é apenas `proposal.title` (ex: "Assessoria para Residência"), sem o nome do cliente. Deveria ser algo como "Assessoria para Residência — João Silva".

## Correções

### Ficheiro: `supabase/functions/proposal-pdf/index.ts`

**1. Corrigir o path de layout dinâmico:**
- Remover o código duplicado/sobrescrito (linhas 165-185)
- Renderizar os blocos em ordem, mas inserir o título + validade logo após o primeiro bloco `header` (ou no início se não houver header)
- O título deve incluir o nome do cliente: `"${proposal.title} — ${proposal.client_name}"`

**2. Corrigir o título no path fallback (hardcoded):**
- Linha 242: alterar de `${title}` para incluir o nome do cliente

**3. Lógica do título composto:**
```
const composedTitle = [proposal.title, proposal.client_name]
  .filter(Boolean)
  .join(" — ");
```

**4. Layout dinâmico corrigido:**
- Iterar os blocos e após renderizar o bloco `header`, inserir um bloco de título + validade
- Não usar manipulação de substring — construir o HTML sequencialmente

### Ficheiros a editar
- `supabase/functions/proposal-pdf/index.ts`

