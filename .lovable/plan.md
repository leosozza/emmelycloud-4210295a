

## Redesign dos Widgets Bitrix24 com UI Nativa

Substituir emojis e estilo generico por icones SVG inline e design system alinhado com o Bitrix24 UI Kit nos 3 ficheiros de placement (CRM Tab, IM Sidebar, IM Context Menu).

### Problema Atual

Os 3 widgets usam emojis como icones (e.g. `&#128736;`, `&#128203;`, `&#128172;`) e cores personalizadas (indigo `#6366f1`, roxo `#8b5cf6`) que nao seguem a identidade visual do Bitrix24.

### Abordagem

Como os widgets correm em iframes isolados (nao herdam CSS do portal Bitrix24) e a biblioteca `@bitrix24/b24icons` e para Vue/Nuxt (nao aplicavel a HTML puro), a solucao e:

1. **Usar SVG inline** que replicam os icones do `ui-icon-set` do Bitrix24 (mesmo estilo de outline, 24px, strokeWidth 1.5)
2. **Adoptar a paleta Bitrix24**: azul primario `#2fc6f6` -> `#2283d8`, gradiente header `linear-gradient(135deg, #2283d8, #7b5ea7)`, e cores neutras do design system
3. **Tipografia**: usar a fonte do sistema Bitrix24 (`"Helvetica Neue", Helvetica, Arial, sans-serif`)
4. **Botoes e Cards**: border-radius 6-8px, sombras subtis, hover states consistentes com b24ui

### Ficheiros a Editar

**1. `supabase/functions/bitrix24-im-sidebar/index.ts`**
- Substituir header indigo por gradiente Bitrix24 (`#2283d8` -> `#7b5ea7`)
- Substituir emojis por SVGs inline: robot (header), chat-bubble (contexto), clipboard (resumir), target (procedimento), message (sugerir), smile (sentimento), lightbulb (empty state), send (botao enviar)
- Actualizar cores dos botoes de sugestao para azul Bitrix24
- Spinner com cor Bitrix24

**2. `supabase/functions/bitrix24-im-context-menu/index.ts`**
- Substituir emojis por SVGs inline: search (header), clipboard (resumir), globe (traduzir), message-circle (sugerir), smile (sentimento), copy (copiar)
- Hover e active states com azul Bitrix24 em vez de indigo
- Spinner com cor Bitrix24
- Copy button com estilo Bitrix24

**3. `supabase/functions/bitrix24-crm-tab/index.ts`**
- Tabs: substituir emojis por SVGs inline (message-circle para Conversa, robot/ai para Consultar IA)
- Header avatar: manter estilo mas com gradiente Bitrix24
- Botoes de sugestao IA: SVGs inline (clipboard, list, lightbulb, drama-masks)
- Botao "Devolver ao Bot": cor alinhada com Bitrix24
- Botoes de iniciar conversa: manter cores de canal (verde WhatsApp, rosa Instagram)
- Context banner da IA: cores Bitrix24
- Substituir todos os emojis restantes nos templates de HTML

### Iconografia SVG

Definir um bloco de constantes SVG reutilizaveis no topo de cada funcao HTML:

```text
icone-robot:     path M12 2a2 2 0 012 2v1h3a2 2 0 012 2v...  (bot/AI)
icone-message:   path M21 15a2 2 0 01-2 2H7l-4 4V5a2...     (conversa)
icone-clipboard: path M9 5H7a2 2 0 00-2 2v12a2 2 0...        (resumir)
icone-globe:     circle + paths                                (traduzir)
icone-smile:     circle + paths                                (sentimento)
icone-target:    circles concentricos                          (procedimento)
icone-send:      path M22 2L11 13 M22 2l-7 20-4-9-9-4z       (enviar)
icone-copy:      rects sobrepostos                             (copiar)
icone-search:    circle + line                                 (pesquisa)
icone-lightbulb: path bulb                                     (sugestao/empty)
```

Cada SVG tera `width="18" height="18"` (ou 20 para headers), `stroke="currentColor"`, `fill="none"`, `stroke-width="1.5"` -- alinhado com o estilo outline do b24icons.

### Paleta de Cores

```text
Primario:     #2283d8 (azul Bitrix24)
Secundario:   #7b5ea7 (roxo)
Acento:       #d4728b (rosa)
Gradiente:    linear-gradient(135deg, #2283d8, #7b5ea7)
Hover btn:    #1b6cb8
Active state: #2283d8 com 10% opacity background
Texto:        #333840 (primario), #959ca4 (secundario)
Borders:      #dfe0e3
Background:   #f5f7fa (fundo), #ffffff (cards)
```

Nenhuma nova dependencia. Nenhuma migracao de BD. Apenas alteracoes cosmeticas nos 3 ficheiros de edge functions.

