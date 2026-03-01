

## Redesign completo do /bitrix24 seguindo padroes b24ui

A pagina `/bitrix24` (iframe) precisa de uma revisao visual completa para alinhar com o design system do Bitrix24 UI Kit (b24ui). O ficheiro tem 2264 linhas com 10 views internas.

### Problemas identificados

1. **Sidebar** - Estilo generico, sem gradiente no header, sem destaque visual no item ativo
2. **Headers das views** - Titulos simples sem barra de contexto ou gradiente Bitrix24
3. **Cards** - Sem hierarquia visual, todos iguais, sem hover states
4. **Botoes** - Estilo padrao shadcn/ui, nao segue o arredondamento e cores b24ui
5. **Status pills** - Inconsistentes, mistura de emojis com badges
6. **Tabelas** - Estilo basico, sem zebra-striping ou hover row
7. **KPI cards** - Layout flat sem destaque visual
8. **Forms** - Inputs sem o estilo b24ui (border-radius, focus ring)
9. **Empty states** - Genericos, sem ilustracao ou estilo Bitrix24
10. **Logs** - Usam emojis (emoji arrows, warning signs) em vez de icones

### Abordagem

Aplicar o design system b24ui ao ficheiro `Bitrix24App.tsx` e ao `index.css`:

**Paleta b24ui:**
- Primario: `#2283d8` (azul Bitrix24)
- Secundario: `#7b5ea7` (roxo)
- Acento: `#d4728b` (rosa)
- Success: `#589731`, Warning: `#c49c00`, Danger: `#df532d`
- Background: `#f5f7fa`, Cards: `#ffffff`
- Borders: `#dfe0e3`, Text: `#525c69` (secundario), `#333840` (primario)

**Tipografia:** Manter Figtree (ja alinhado com b24ui que usa system fonts)

### Alteracoes por area

**1. Sidebar (linhas 198-264)**
- Header com gradiente `linear-gradient(135deg, #2283d8, #7b5ea7)` e logo branco
- Items de navegacao com pill arredondada (border-radius 8px) e fundo semi-transparente no ativo
- Icones com cor primaria quando activo
- Footer com status dot mais visivel
- Separadores entre categorias mais subtis

**2. Dashboard View (linhas 292-707)**
- Status cards com borda esquerda colorida (verde/vermelho/azul) estilo b24ui
- Steps de "Inicio Rapido" com linha vertical conectando os passos (stepper b24ui)
- Substituir emojis por icones Lucide (CheckCircle, XCircle, AlertCircle em vez de emoji checkmarks)
- Botoes com estilo b24ui: border-radius 6px, transicoes suaves
- Log entries com icones SVG em vez de emoji arrows
- Card "Devolver ao Bot" com borda accent

**3. Agentes/Personas View (linhas 710-912)**
- Cards de agente com hover elevation (shadow-md no hover)
- Badges de status (activo/inactivo) com cores b24ui
- Avatar do agente com gradiente Bitrix24
- Botoes de accao com icones mais proeminentes

**4. Training View (linhas 915-1029)**
- Formulario com estilo b24ui (labels acima, inputs com focus ring azul)
- Lista de documentos com icone de tipo de ficheiro colorido
- Badges de chunks com estilo pill arredondado

**5. Flows View (linhas 1032-1380)**
- Lista de fluxos com card hover state
- Toggle activo/inactivo com cor b24ui
- Formulario de criacao com grid mais limpo

**6. Chat IA View (linhas 1381-1576)**
- Sidebar de sessoes com estilo b24ui
- Message bubbles com border-radius assimetrico (estilo b24 messenger)
- Input area com sombra sutil e border-radius maior

**7. Playground View (linhas 1579-1678)**
- Layout similar ao Chat IA mas simplificado
- Agent selector com estilo b24ui

**8. Pagamentos View (linhas 1681-1913)**
- Form de cobranca com grid mais limpo
- Status badges consistentes com b24ui
- Transaction list com hover state

**9. Relatorios View (linhas 1916-2251)**
- KPI cards com icone dentro de circulo colorido (estilo b24ui)
- Period pills com estilo b24ui (arredondados, transicao suave)
- Tabela com zebra-striping e header fixo estilizado
- Chart tooltips com estilo b24ui

**10. index.css**
- Adicionar variaveis CSS para cores de status b24ui
- Adicionar classes utilitarias para o estilo b24ui (hover cards, stepper, etc.)

### Detalhes tecnicos

**Sidebar redesign:**
```text
Header: bg-bitrix-gradient, texto branco, logo com fundo branco/10
Nav items: rounded-lg, active = bg-white/10 text-primary (claro) ou bg-primary/15 (escuro)
Categories: uppercase tracking-wider, separador sutil
Footer: status dot animado (pulse quando conectado)
```

**Card pattern b24ui:**
```text
border-radius: 12px
border: 1px solid var(--border)
hover: shadow-sm -> shadow-md transition
header: font-size 14px, font-weight 600
padding: 16px-20px
```

**Button pattern b24ui:**
```text
border-radius: 6px
primary: bg-[#2283d8] hover:bg-[#1b6cb8]
height: 36px (default), 28px (sm)
font-weight: 500
```

**Status pattern b24ui:**
```text
Success: bg-[#589731]/10 text-[#589731] border-l-[#589731]
Warning: bg-[#c49c00]/10 text-[#c49c00] border-l-[#c49c00]
Danger: bg-[#df532d]/10 text-[#df532d] border-l-[#df532d]
```

### Ficheiros a editar

1. **`src/pages/Bitrix24App.tsx`** - Redesign completo das 10 views internas (sidebar, dashboard, agentes, training, flows, chat IA, playground, pagamentos, relatorios, mapeamento)
2. **`src/index.css`** - Adicionar classes utilitarias b24ui (card hover, stepper, status borders)

Nenhuma nova dependencia. Nenhuma migracao de BD. Apenas alteracoes visuais/CSS.

