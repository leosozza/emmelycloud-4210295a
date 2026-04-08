

# Restaurar Acesso à Página de Integrações (WhatsApp/Instâncias)

## Problema

A página `/integracoes` existe e tem rota registada em `App.tsx`, mas foi removida de ambas as barras laterais:
- **AppSidebar** (portal principal) — não tem link para `/integracoes`
- **Bitrix24App** (iframe) — `navCategories` não inclui "Integrações"

Resultado: é impossível aceder à página de criar instâncias e conectar WhatsApp.

## Correções

### Ficheiro 1: `src/components/AppSidebar.tsx`

Adicionar "Integrações" ao array `secondaryNav` (secção "Gestão"), com ícone `Plug`:
```typescript
{ title: "Integrações", url: "/integracoes", icon: Plug },
```

### Ficheiro 2: `src/pages/Bitrix24App.tsx`

Adicionar "Integrações" ao `navCategories`, na categoria "Sistema" (junto a Configurações):
```typescript
{ id: "integracoes", label: "Integrações", icon: Plug },
```

Também adicionar `"integracoes"` ao array `validViews` (linha 98) e tratar o caso no render de views para que carregue o componente `IntegracoesPage` quando `view === "integracoes"`.

### Ficheiros a editar

1. **`src/components/AppSidebar.tsx`** — adicionar link "Integrações" ao menu lateral
2. **`src/pages/Bitrix24App.tsx`** — adicionar nav item + view routing para Integrações

