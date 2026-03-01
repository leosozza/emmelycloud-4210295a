

## Redesign completo do /bitrix24 - Tema Claro e UI limpa

### Problemas actuais

1. **Tema escuro forcado** - O hook `useBitrix24Theme` usa `prefers-color-scheme` do sistema. No preview, isto resulta em fundo escuro com textos hardcoded para tema claro (`#333840`, `#525c69`) que ficam invisiveis ou feios.
2. **Cores inline por todo o lado** - Centenas de `style={{ color: '#333840' }}` que nao respondem ao tema. Isto cria inconsistencia visual massiva.
3. **Layout carregado** - Cards demasiado densos, spacing inconsistente, headers de gradiente que nao combinam com o fundo escuro.
4. **Sidebar pesada** - O gradiente no header fica estranho em contexto escuro.

### Solucao

**1. Forcar tema claro como padrao**

Alterar `useBitrix24Theme` para iniciar em tema claro (`isDark: false`) por defeito. O tema escuro so sera activado quando o Bitrix24 parent enviar explicitamente `scheme: "dark"`.

**2. Remover TODOS os inline styles de cor**

Substituir todos os `style={{ color: '#333840' }}` e `style={{ color: '#525c69' }}` por classes Tailwind semanticas (`text-foreground`, `text-muted-foreground`) que funcionam em ambos os temas.

**3. Redesign visual completo seguindo b24ui**

O b24ui oficial usa:
- Fundo claro (`#f5f7fa`) com cards brancos
- Sidebar com header de gradiente azul-para-roxo
- Cards com border-radius 12px, bordas subtis (`#dfe0e3`)
- Botoes com azul primario (`#2283d8`), radius 6px
- Tipografia limpa com hierarquia clara

**4. Simplificar a estrutura visual**

- View headers: substituir o gradiente pesado por um header mais limpo com titulo e breadcrumb
- Cards: usar componentes Card standard com hover states
- Remover redundancias visuais (icones duplicados, badges excessivos)

### Alteracoes detalhadas

**Ficheiro: `src/hooks/useBitrix24Theme.ts`**
- Mudar o `useState` inicial para `false` (tema claro por defeito)
- O Bitrix24 parent continuara a poder mudar para escuro via postMessage

**Ficheiro: `src/pages/Bitrix24App.tsx`**
- Container principal: remover `style={{ background: isDark ? ... }}` e usar classes Tailwind
- Sidebar: manter gradiente no header mas usar classes Tailwind para o resto
- Dashboard: substituir `style={{ color: '#333840' }}` por `text-foreground` (aprox. 40+ ocorrencias)
- Status cards: manter `b24-status-*` classes mas remover inline colors
- Stepper: manter `b24-stepper` mas com cores semanticas
- Chat/Playground views: remover inline `style` e usar classes Tailwind
- Relatorios: manter charts mas corrigir cores para tema claro
- Todas as views: substituir hardcoded colors por classes CSS semanticas

**Ficheiro: `src/index.css`**
- Verificar que as variaveis CSS de tema claro estao correctas
- Ajustar classes `.b24-*` para usar variaveis CSS em vez de cores fixas

### Resumo de alteracoes

| Ficheiro | Tipo | Descricao |
|---|---|---|
| `src/hooks/useBitrix24Theme.ts` | Editar | Tema claro como defeito |
| `src/pages/Bitrix24App.tsx` | Editar | Remover 40+ inline styles, usar classes Tailwind semanticas, limpar layout |
| `src/index.css` | Editar | Ajustar classes b24 para suportar ambos os temas via variaveis CSS |

Nenhuma nova dependencia. Nenhuma migracao de BD. A funcionalidade permanece identica -- apenas alteracoes visuais.

