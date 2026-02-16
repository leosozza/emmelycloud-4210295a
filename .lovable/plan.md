
# Plano: Pagina de Roadmap com Visual de Estagios

## Resumo

Criar uma pagina `/roadmap` com visual de progresso por modulo, mostrando claramente o que esta concluido (100%), em progresso, e por iniciar. Interface moderna com cards agrupados por fase, barra de progresso, e indicadores visuais de status.

---

## 1. Nova Pagina e Rota

- Criar `src/pages/Roadmap.tsx`
- Adicionar rota `/roadmap` no `App.tsx`
- Adicionar link "Roadmap" no sidebar (grupo "Gestao") com icone `Map`

---

## 2. Estrutura Visual

O layout sera dividido em 4 secoes (fases), cada uma com um header e cards de modulos:

```text
+---------------------------------------------------+
|  Progresso Geral: =========[72%]=========          |
+---------------------------------------------------+
|                                                     |
|  [Concluido] --------------------------------       |
|  [====] Design System     [====] Layout             |
|  [====] Dashboard         [====] Backend            |
|  [====] Auth              [====] Perfil             |
|  [====] SLA               [====] Central Atend.     |
|                                                     |
|  [Proximas Etapas] --------------------------       |
|  [==50] Gestao Roles      [====] Funil Kanban       |
|  [    ] Formulario Leads  [    ] Ficha Lead         |
|  [    ] Triagem IA        [    ] Casos              |
|  [    ] Propostas         [    ] Contratos          |
|                                                     |
|  [Futuro Proximo] ---------------------------       |
|  [    ] Financeiro        [    ] Dashboard Real     |
|  [    ] Automacoes        [    ] Relatorios         |
|  [    ] Busca Global      [    ] Notificacoes       |
|                                                     |
|  [Futuro] ------------------------------------      |
|  [    ] IA Resumo         [    ] IA Documental      |
|  [    ] WhatsApp API      [    ] Instagram DM       |
|  [    ] PDF Propostas     [    ] Assinatura Digital  |
|  [    ] Multi-escritorios [    ] PWA Mobile          |
+---------------------------------------------------+
```

---

## 3. Cada Card de Modulo

Cada card tera:
- Nome do modulo
- Barra de progresso (0%, 25%, 50%, 75%, 100%)
- Badge de status com cor: verde (concluido), azul (em progresso), cinza (por iniciar)
- Descricao curta do que inclui

---

## 4. Dados do Roadmap

Todos os dados serao estaticos (hardcoded) na pagina, sem tabela no banco de dados, representando o roadmap que o utilizador forneceu. Os modulos e percentagens podem ser ajustados manualmente conforme o progresso.

---

## 5. Detalhes Tecnicos

- **Novo ficheiro**: `src/pages/Roadmap.tsx` - pagina com dados estaticos e componentes Card/Progress/Badge
- **Editados**:
  - `src/App.tsx` - adicionar rota `/roadmap`
  - `src/components/AppSidebar.tsx` - adicionar link no grupo Gestao com icone `Map`
- **Componentes reutilizados**: Card, Progress, Badge do shadcn/ui
- Cores de status via classes Tailwind (success, primary, muted)
- Barra de progresso geral no topo somando todos os modulos
