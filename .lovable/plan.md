
## Objetivo

Redesenhar a UI do Emmely Pay dentro do Bitrix24 para ficar visualmente próxima do app Asaas (referência: `leosozza/bitrix24-asaas-link`), e remover qualquer toggle/meta de tema manual — o tema passa a seguir 100% automático o sistema operativo, para parecer nativo do Bitrix.

Escopo: **aba Emmely Pay** (HTML servido pela edge function), **modal de novo pagamento** e **página pública `/pay`**.

## Mudanças

### 1. Tema 100% automático (sem toggle)

**`supabase/functions/bitrix24-payment-tab/index.ts`** (HTML do placement):
- Remover qualquer botão/switch de tema e qualquer leitura de `localStorage` de tema.
- Remover `<meta name="color-scheme" content="...">` fixo. Usar `<meta name="color-scheme" content="light dark">` para o browser saber que suportamos os dois.
- Tokens CSS definidos em `:root` (claro) e sobrescritos via `@media (prefers-color-scheme: dark)` — sem classe `.dark`, sem JS de tema.
- Manter listener `postMessage` do Bitrix (`ChangeColorScheme` / `B24Frame:theme`) **apenas como override opcional**: quando chega, aplica `data-theme="dark|light"` no `<html>` e tokens reagem; sem evento, fica no `prefers-color-scheme`.

**`src/pages/PagamentoPublico.tsx`**:
- Mesmo princípio: remover qualquer força de tema; deixar o `ThemeContext`/Tailwind seguir o sistema (`media` em vez de `class` no contexto público) ou aplicar `.dark` automaticamente conforme `matchMedia('(prefers-color-scheme: dark)')` no mount, sem UI de toggle.

**`src/hooks/useBitrix24Theme.ts`**: simplificar — mantém só prefers-color-scheme + postMessage do Bitrix; remover qualquer estado persistido.

### 2. Linguagem visual Asaas-like

Aplicar nos três contextos (aba, modal, /pay):

- **Paleta**: fundo neutro muito claro (`#F7F8FA` / dark `#0E1116`), cards brancos com borda 1px hairline (`#E5E7EB` / dark `#1F2937`), primário azul Asaas (`#1B6EF3` aprox.), success verde (`#10B981`), warning âmbar, danger vermelho suave.
- **Tipografia**: Inter system stack, pesos 500/600 nos títulos, 400 no corpo, tamanhos compactos (13/14/16/20).
- **Cards**: `border-radius: 12px`, `box-shadow` mínima (`0 1px 2px rgba(0,0,0,.04)`), padding 20/24, headers com ícone + título + subtítulo em cinza.
- **Botão primário**: cheio azul, radius 8, altura 40, ícone à esquerda; secundário ghost com borda.
- **Inputs**: altura 40, radius 8, foco com ring azul translúcido, label pequena acima.
- **Status pills**: pílulas arredondadas com fundo tint da cor (success/warning/danger/info), texto da cor saturada — padrão Asaas.
- **Linha do tempo de cobrança**: stepper horizontal com bolinhas e linha conectora (criado → enviado → visualizado → pago), inspirado no painel Asaas.
- **Tabela de cobranças**: linhas zebradas suaves, valor alinhado à direita em tabular-nums, status como pill, ações em ícones discretos.
- **Header da aba**: título + subtítulo + ação primária à direita; sem gradiente forte (atual usa gradient roxo/vermelho do tema Emmely — trocar por superfície neutra com accent azul).
- **Modal de novo pagamento**: layout em duas colunas (resumo do deal à esquerda, formulário à direita), rodapé fixo com ações.
- **/pay público**: card central 480px máx, logo no topo, valor em destaque grande, métodos de pagamento como tabs com ícones (Pix / Cartão / Boleto), CTA full-width.

### 3. Tokens reutilizáveis

No HTML do placement, definir um bloco `:root` único com as variáveis (sem depender de Tailwind, pois é HTML estático servido pela edge). No app React (`/pay`), adicionar uma classe scope `.emmely-pay` em `src/index.css` com os mesmos tokens semânticos para não interferir no resto do CRM.

## Detalhes técnicos

- `bitrix24-payment-tab/index.ts`: reescrever o `<style>` inline e o markup das seções (header, KPIs, tabela, modal). Manter toda a lógica JS de fetch/criação de cobrança intacta — só troca classes/estrutura.
- `PagamentoPublico.tsx`: refatorar JSX para o novo layout; remover imports/uso de toggle de tema; usar tokens já existentes (`bg-card`, `text-foreground`, `border-border`) e adicionar utilitários locais quando preciso.
- `useBitrix24Theme.ts`: enxugar para retornar apenas `scheme`, sem persistência.
- Sem mudanças de backend, sem novas tabelas, sem novas dependências.

## Fora do escopo

- Lógica de criação de cobrança Asaas (já existe).
- Auto-preenchimento de campos UF_CRM (já feito em turnos anteriores).
- Robot Bizproc de contrato (turno separado).
