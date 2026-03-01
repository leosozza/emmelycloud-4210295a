

## Corrigir Contraste de Cores no /bitrix24 (Dark Mode)

O problema principal e que no modo escuro, varios elementos (botoes, selects, badges, texto de tabelas) tem cores de texto muito proximas da cor de fundo, tornando-os invisiveis ou dificeis de ler.

### Problemas Identificados

1. **Botoes `outline` e `ghost`**: O texto usa `foreground` que no dark mode pode ficar com baixo contraste sobre `bg-card`
2. **Select triggers** (Lead/Leads no Mapeamento): Texto quase invisivel no fundo escuro
3. **Badges `variant="outline"`**: Borda e texto com contraste insuficiente
4. **Texto `text-muted-foreground`**: No dark mode, o valor `220 9% 55%` e demasiado escuro sobre fundos escuros
5. **Tabela do Mapeamento**: Celulas com `font-mono text-xs` dificeis de ler
6. **Sidebar do Chat IA**: Items da lista de conversas com texto que se confunde com o fundo

### Solucao

Ajustar as variaveis CSS do dark mode em `src/index.css` para melhorar o contraste global, sem alterar o light mode:

- `--muted-foreground`: Aumentar luminosidade de 55% para 65% (texto secundario mais legivel)
- `--border` e `--input`: Aumentar luminosidade de 18% para 22% (bordas mais visiveis nos selects/inputs)
- `--muted`: Aumentar de 14% para 17% (fundos de hover/muted mais distinguiveis)
- `--secondary`: Aumentar de 16% para 20% (botoes secundarios mais visiveis)

Adicionalmente, ajustes pontuais em `src/pages/Bitrix24App.tsx`:

- Adicionar classes explicitas de cor nos botoes do toolbar do Mapeamento
- Usar `text-foreground` em vez de herdar cores implicitas nos Select triggers
- Melhorar contraste dos badges de tipo na tabela de mapeamento
- Adicionar `border` explicito nos cards da sidebar de conversas

### Ficheiros a alterar

- `src/index.css` -- ajustar variaveis dark mode para melhor contraste
- `src/pages/Bitrix24App.tsx` -- ajustes pontuais de classes de cor em elementos especificos
- `src/components/bitrix24/FieldMappingManager.tsx` -- melhorar contraste na tabela de mapeamento

### Impacto

As alteracoes nas variaveis CSS afetam toda a app em dark mode (melhoria global), enquanto os ajustes pontuais corrigem problemas especificos do iframe Bitrix24.
