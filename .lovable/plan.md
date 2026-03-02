

## Aplicar Novo Tema de Cores

O utilizador forneceu um novo esquema de cores (lilás/rosa) para substituir o actual (azul). Vou converter os valores hex para HSL (formato usado pelo projecto) e actualizar o `src/index.css`.

### Alteracoes

**`src/index.css`** — Substituir todas as variaveis CSS `:root` e `.dark` pelos novos valores:

| Variavel | Light (hex → hsl) | Dark (hex → hsl) |
|---|---|---|
| --background | #f8f7fa → 260 18% 97% | #1a1823 → 256 18% 12% |
| --foreground | #3d3c4f → 244 14% 27% | #e0ddef → 249 41% 90% |
| --card | #ffffff → 0 0% 100% | #232030 → 249 20% 16% |
| --primary | #8a79ab → 263 23% 57% | #a995c9 → 263 34% 69% |
| --secondary | #dfd9ec → 260 30% 89% | #5a5370 → 255 14% 38% |
| --muted | #dcd9e3 → 252 14% 87% | #242031 → 256 22% 16% |
| --accent | #e6a5b8 → 343 52% 77% | #372e3f → 268 15% 21% |
| --destructive | #d95c5c → 0 60% 60% | #e57373 → 0 68% 67% |
| --border | #cec9d9 → 258 14% 82% | #302c40 → 252 18% 21% |
| --input | #eae7f0 → 260 22% 93% | #2a273a → 252 18% 19% |
| --ring | #8a79ab → 263 23% 57% | #a995c9 → 263 34% 69% |
| --sidebar-* | Converter correspondentes | Converter correspondentes |
| --chart-1..5 | Converter correspondentes | Converter correspondentes |

Tambem actualizar:
- `font-family` para `Geist, sans-serif` conforme `--font-sans`
- `--radius` para `0.5rem`

Os gradientes Bitrix (`.bg-bitrix-gradient`, `.b24-sidebar-header`) serao actualizados para usar tons lilas/rosa em vez de azul.

### Ficheiros

| Ficheiro | Accao |
|---|---|
| `src/index.css` | Substituir variaveis `:root` e `.dark`, actualizar gradientes |

