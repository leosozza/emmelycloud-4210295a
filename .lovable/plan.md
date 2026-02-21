

# Plano: Redesenhar Emmely Pay para parecer nativo no Bitrix24

## Problema

A aba Emmely Pay utiliza estilos personalizados (cards coloridos, emojis, fontes do sistema) que nao seguem o visual nativo do Bitrix24. O resultado e uma interface que parece "externa" ao ecossistema.

## Abordagem

Reescrever o HTML/CSS da funcao `bitrix24-payment-tab/index.ts` para replicar os padroes visuais nativos do Bitrix24, incluindo suporte a tema claro/escuro.

**Nota:** A biblioteca b24ui e exclusiva para Vue/Nuxt, por isso nao pode ser utilizada num iframe HTML puro. A solucao e replicar os estilos CSS nativos do Bitrix24 manualmente.

## Alteracoes Visuais

### 1. Tipografia e Base

| Atual | Nativo Bitrix24 |
|-------|----------------|
| `-apple-system, BlinkMacSystemFont` | `"Open Sans", Helvetica, Arial, sans-serif` |
| Fundo `#f8f8f8` | Fundo `#eef2f4` (claro) / `#1e2b36` (escuro) |
| Bordas arredondadas `12px` | Bordas `4px` (padrao Bitrix) |
| Emojis como icones | SVG inline ou texto simples |

### 2. Resumo Financeiro (Header)

Substituir os "summary cards" coloridos por um bloco estilo Bitrix24 CRM widget:

- Fundo branco com borda inferior `#e0e5e8`
- Titulo em `13px`, peso `600`, cor `#333` (claro) / `#fff` (escuro)
- Valores em linha com labels cinza `#959ca4` e valores bold
- Barra de progresso fina (4px) com cantos `2px`, cor `#2fc6f6` (azul Bitrix)

### 3. Cards de Parcelas

Substituir os cards coloridos por linhas de tabela/lista estilo Bitrix24:

- Fundo `#fff` (claro) / `#2a3942` (escuro)
- Borda `1px solid #e0e5e8`
- Raio de borda `4px`
- Status como badge inline com cores Bitrix:
  - Pago: fundo `#e0f5d7`, texto `#589731`
  - Atrasado: fundo `#fce4e1`, texto `#df532d`
  - Pendente: fundo `#eef2f4`, texto `#959ca4`
  - Vencendo: fundo `#fef4d6`, texto `#c49c00`
- Sem emojis - usar texto puro ou SVG minimalista
- Fonte `13px`, espacamento consistente de `12px`

### 4. Botoes e Selects

- Botao principal: fundo `#2fc6f6` (azul Bitrix), hover `#22a9d4`, cor `#fff`, raio `4px`, altura `32px`
- Botao "Disparar": cor Emmely `#722F37` mantida mas com raio `4px` e estilo flat
- Select: borda `#c6cdd3`, raio `3px`, altura `32px`, fonte `13px`

### 5. Suporte a Tema Escuro

Implementar CSS variables que alternam via classe `.dark` no body:

```text
Claro                    Escuro
--bg-page: #eef2f4       --bg-page: #1e2b36
--bg-card: #fff          --bg-card: #2a3942
--text-primary: #333     --text-primary: #e4e9eb
--text-secondary: #959ca4 --text-secondary: #7b8b97
--border: #e0e5e8        --border: #3d4f5c
```

Deteccao do tema via `postMessage` do parent Bitrix24 (mesmo padrao usado no `useBitrix24Theme.ts`).

### 6. Estado Vazio

Substituir o emoji grande por um SVG minimalista e texto alinhado ao estilo Bitrix24:
- Icone SVG de cartao de credito em cinza claro
- Texto `14px`, cor `#959ca4`
- Sem bordas ou caixas adicionais

## Detalhes Tecnicos

### Ficheiro alterado
- `supabase/functions/bitrix24-payment-tab/index.ts` -- apenas a funcao `renderPaymentTab()` e os estilos CSS

### Logica de backend
- Sem alteracoes na logica de dados (queries, tokens, filtros de transacoes)
- Apenas alteracoes no HTML/CSS gerado

### Deteccao de tema (JavaScript no iframe)

```text
window.addEventListener("message", function(e) {
  if (e.data && (e.data.theme === "dark" || e.data.action === "ChangeColorScheme")) {
    document.body.classList.toggle("dark", ...);
  }
});
```

### Estrutura HTML resultante

```text
+------------------------------------------+
| Emmely Pay - [Nome do Negocio]           |
|                                          |
| Total        Pago         Em Aberto      |
| EUR 6.000    EUR 2.000    EUR 4.000      |
| [====------] 33% pago                   |
+------------------------------------------+
| Parcela 1/6        EUR 1.000,00   [Pago] |
| Vence: 01/01/2026  Pago: 15/01/2026     |
+------------------------------------------+
| Parcela 2/6        EUR 1.000,00   [Pago] |
| Vence: 01/02/2026  Pago: 12/02/2026     |
+------------------------------------------+
| Parcela 3/6       EUR 1.000,00 [Atrasado]|
| Vence: 01/03/2026                        |
| [Selecionar fluxo...] [Disparar]         |
+------------------------------------------+
| Parcela 4/6       EUR 1.000,00 [Pendente]|
| ...                                      |
+------------------------------------------+
```

## Resumo de Impacto

- Apenas alteracoes visuais (CSS/HTML) na Edge Function
- Zero impacto na logica de negocio
- Suporte nativo a tema claro/escuro do Bitrix24
- Visual consistente com outras abas nativas do CRM

