

# Tema Azul — Alternativa de Cores

## O que será feito

Adicionar um seletor de tema de cor nas configurações (acessível pelo menu do utilizador no header) que permite alternar entre o tema atual **Vermelho** e um novo tema **Azul**.

## Como funciona

### 1. CSS — Adicionar variantes de cor azul
**Ficheiro:** `src/index.css`

Adicionar classes `.theme-blue` e `.dark.theme-blue` que sobrescrevem as variáveis CSS `--primary`, `--ring`, `--accent`, `--sidebar-primary`, `--sidebar-ring`, `--chart-*`, etc., substituindo os tons vermelhos/dourados por tons azuis.

```text
:root            → vermelho (padrão, sem alteração)
.theme-blue      → azul (light)
.dark.theme-blue → azul (dark)
```

### 2. Contexto de Tema
**Novo ficheiro:** `src/contexts/ThemeContext.tsx`

- Criar `ThemeProvider` que lê/guarda o tema escolhido em `localStorage`
- Aplicar a classe `theme-blue` no `<html>` quando selecionado
- Expor `theme` e `setTheme` via hook `useTheme`

### 3. Página de Configurações
**Novo ficheiro:** `src/pages/Configuracoes.tsx`

- Secção "Aparência" com cards visuais para cada tema (Vermelho e Azul)
- Cada card mostra uma preview da cor com borda de seleção
- Ao clicar, aplica o tema imediatamente

### 4. Integrar no layout
- **`src/App.tsx`**: Envolver com `ThemeProvider`, adicionar rota `/configuracoes`
- **`src/components/AppSidebar.tsx`**: Adicionar item "Configurações" no grupo secundário
- **`src/components/AppHeader.tsx`**: O item "Configurações" no dropdown do avatar navega para `/configuracoes`

### Paleta Azul (valores HSL)
| Variável | Light | Dark |
|---|---|---|
| `--primary` | `220 60% 42%` | `220 70% 50%` |
| `--ring` | `220 60% 42%` | `220 70% 50%` |
| `--accent` | `210 80% 90%` | `220 50% 35%` |
| `--accent-foreground` | `220 60% 30%` | `210 80% 90%` |
| `--sidebar-primary` | `220 60% 42%` | `220 70% 50%` |
| `--sidebar-accent` | `210 80% 90%` | `220 50% 35%` |
| `--chart-1/3` | tons azuis | tons azuis |

### Ficheiros a criar/editar
1. `src/index.css` — classes `.theme-blue`
2. `src/contexts/ThemeContext.tsx` — novo contexto
3. `src/pages/Configuracoes.tsx` — nova página
4. `src/App.tsx` — rota + provider
5. `src/components/AppSidebar.tsx` — link configurações
6. `src/components/AppHeader.tsx` — link configurações no dropdown

