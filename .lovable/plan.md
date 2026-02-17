

# Redesign Visual: Estilo Bitrix24 UI

## Resumo

Aplicar o design system visual do Bitrix24 UI ao Emmely Cloud, adaptando cores, gradientes, tipografia e estilos de componentes para seguir a linguagem visual do Bitrix24 -- sem instalar o pacote Vue deles (incompativel com React), apenas replicando o estilo visual via CSS/Tailwind.

## Elementos visuais do Bitrix24 a replicar

- **Header com gradiente azul-roxo-rosa**: Fundo com gradient linear suave, nao cor solida
- **Nav pills arredondadas**: Items de navegacao com fundo semi-transparente arredondado
- **Page headers com banner gradiente**: Titulo de cada pagina dentro de um banner azul gradiente com texto branco (como as paginas de componentes do Bitrix24)
- **Cards brancos limpos**: Bordas muito subtis, cantos arredondados, sombras minimas
- **Paleta de cores**: Azul primario mais vibrante (~#2583d8), acentos roxo/rosa
- **Tipografia**: Manter Figtree mas ajustar pesos

## Ficheiros a alterar

### 1. `src/index.css` -- Paleta de cores CSS
- Atualizar variaveis CSS `:root` para cores mais proximas do Bitrix24
- Azul primario mais vibrante (218 80% 55%)
- Adicionar variaveis para gradientes do header
- Background mais claro e neutro
- Cards com bordas mais subtis

### 2. `tailwind.config.ts` -- Tokens Tailwind
- Adicionar utilitarios de gradiente customizados para o header
- Ajustar border-radius default (mais arredondado, ~0.75rem)

### 3. `src/components/AppHeader.tsx` -- Header principal
- Trocar `bg-foreground` por gradiente azul-roxo-rosa (`bg-gradient-to-r from-blue-600 via-purple-500 to-pink-400`)
- Nav items com estilo pill mais arredondado (rounded-full)
- Item ativo com fundo branco semi-transparente em vez de bg-primary solido
- Logo area com melhor contraste no gradiente

### 4. `src/components/AppLayout.tsx` -- Layout wrapper
- Adicionar background sutil ao body/main area

### 5. `src/pages/Index.tsx` -- Dashboard
- Metric cards: trocar cores solidas por gradientes suaves ao estilo Bitrix24
- Adicionar banner de titulo com gradiente (como page headers do Bitrix24)

### 6. Todas as paginas principais -- Page header banner
- Criar componente `PageHeader` reutilizavel com banner gradiente azul e titulo branco
- Aplicar em: Leads, Propostas, Contratos, Casos, Carteira, Financeiro, Automacoes, Relatorios, Roadmap, Atendimento

## Detalhes Tecnicos

### Paleta Bitrix24 (aproximada)
```text
Gradiente header: #2583d8 -> #7b5ea7 -> #d4728b
Primario:         #2583d8 (218 72% 50%)
Accent:           #7b5ea7 (270 30% 52%)
Background:       #f5f7fa (220 20% 97%)
Card:             #ffffff
Border:           #e8ecf1 (215 20% 92%)
```

### Componente PageHeader
- Props: title, description
- Banner com gradiente azul->roxo, height ~80px
- Texto branco, cantos arredondados inferiores

### Sem dependencias novas
- Tudo feito com Tailwind CSS classes e variaveis CSS existentes
- Nao instala @bitrix24/b24ui (e um pacote Vue/Nuxt, incompativel)

