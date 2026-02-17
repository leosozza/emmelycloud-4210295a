

# Internacionalização: Seletor de Idioma/Moeda (PT-BR / PT-PT)

## Resumo

Criar um sistema de localização com seletor de bandeira (Brasil / Portugal) que altera o idioma e a moeda em toda a aplicação. Ambas as variantes usam Portugues, mas com diferenças de vocabulário e moeda (BRL vs EUR).

## Como funciona

- Seletor de bandeira no header (ao lado do avatar)
- Brasil: idioma pt-BR, moeda R$ (BRL), formato de data dd/MM/yyyy
- Portugal: idioma pt-PT, moeda EUR, formato de data dd/MM/yyyy
- A preferência fica guardada no localStorage e persiste entre sessões

## Ficheiros novos

### 1. `src/contexts/LocaleContext.tsx`
- Context React com `locale` ("pt-BR" | "pt-PT"), `currency` ("BRL" | "EUR"), e `setLocale`
- Provider que lê/grava a preferência no localStorage
- Hook `useLocale()` para consumir em qualquer componente
- Função utilitária `formatCurrency(value)` que formata automaticamente com `Intl.NumberFormat` conforme a locale ativa

### 2. `src/lib/translations.ts`
- Dicionário de traduções para as diferenças entre pt-BR e pt-PT
- Exemplos de diferenças: "Utilizador" (PT) vs "Usuário" (BR), "Telemóvel" vs "Celular", "Proposta" (igual), etc.
- Função `t(key)` que retorna o texto correto para a locale ativa

## Ficheiros editados

### 3. `src/App.tsx`
- Envolver a app com `<LocaleProvider>`

### 4. `src/components/AppHeader.tsx`
- Adicionar seletor de bandeira (botão com emoji de bandeira ou imagem SVG)
- Clique alterna entre Brasil e Portugal
- Mostra a bandeira ativa

### 5. `src/pages/Index.tsx` (Dashboard)
- Substituir "€32.450" e formatadores hardcoded por `formatCurrency()` do contexto
- Substituir `€` nos tickFormatters dos gráficos pela moeda dinâmica

### 6. `src/pages/Propostas.tsx`
- Substituir `formatCurrency` hardcoded (pt-PT/EUR) pela função do contexto

### 7. `src/pages/Servicos.tsx`
- Substituir `€` hardcoded por símbolo dinâmico
- Default da moeda no formulário passa a vir do contexto

### 8. `src/components/leads/LeadSheet.tsx` e `src/components/atendimento/ConversationList.tsx`
- Substituir `{ locale: pt }` do date-fns pela locale dinâmica (pt-BR ou pt)

## Detalhes Tecnicos

- Zero dependências novas: usa `Intl.NumberFormat` nativo e date-fns (já instalado)
- O contexto expõe: `locale`, `currency`, `currencySymbol`, `formatCurrency(value)`, `setLocale(locale)`, `dateFnsLocale`
- A locale do date-fns usa `pt-BR` ou `pt` conforme seleção (ambas já disponíveis no date-fns)
- localStorage key: `emmely-locale`
- Default: `pt-PT` (mantém comportamento atual)
- O Roadmap recebe um novo item "Internacionalização BR/PT" na secção "Próximas Etapas"

