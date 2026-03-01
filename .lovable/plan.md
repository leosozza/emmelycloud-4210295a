

## Substituir menu de navegacao por Dock flutuante (estilo macOS)

### Conceito

Remover a barra de navegacao (pills) do header e colocar um Dock flutuante no fundo do ecra com efeito de magnificacao ao hover. O header fica minimalista (apenas logo, pesquisa, notificacoes, perfil).

### Novos ficheiros

| Ficheiro | Descricao |
|---|---|
| `src/components/ui/dock.tsx` | Componente Dock com magnificacao (Dock, DockItem, DockLabel, DockIcon) usando framer-motion |

### Ficheiros a editar

**`src/components/AppHeader.tsx`**
- Remover a secao `<nav>` de desktop (linhas 206-246) com os pills e dropdowns
- Manter o top bar intacto (logo, pesquisa, notificacoes, perfil)
- Remover a navegacao mobile grid (linhas 248-265) -- sera substituida pelo Dock
- Simplificar: o header fica apenas com a barra superior (h-14)

**`src/components/AppLayout.tsx`**
- Adicionar o componente `AppDock` no fundo, fixo (`fixed bottom-4 left-1/2 -translate-x-1/2 z-30`)
- O Dock tera todos os itens de navegacao flat (sem grupos/dropdowns -- cada item e directo)
- Clicar num item do Dock navega para a rota correspondente via `useNavigate`

### Itens do Dock

Todos os itens de navegacao actuais, flattened para acesso directo:

```text
Dashboard | Atendimento | Leads | Propostas | Contratos | Casos | Carteira | Financeiro | Automacoes | Relatorios | Integracoes | Agentes | Fluxos | Roadmap
```

Cada item tem icone lucide-react + label tooltip que aparece ao hover com animacao.

### Estrutura visual

```text
+--------------------------------------------------+
| [E] Emmely Cloud   [Pesquisar...]   🔔 [Avatar]  |  <- header slim
+--------------------------------------------------+
|                                                    |
|              Conteudo da pagina                    |
|                                                    |
|                                                    |
+--------------------------------------------------+
      [icon][icon][icon][icon][icon][icon]            <- Dock flutuante
              (magnifica ao hover)
```

### Detalhes tecnicos

- `framer-motion` ja esta instalado no projecto
- O Dock usa `useMotionValue` e `useSpring` para o efeito de magnificacao dos icones
- `DockLabel` aparece como tooltip acima do icone ao hover
- O Dock tera `panelHeight={56}` e `magnification={68}` para nao ser demasiado grande
- Background do dock: `bg-background/80 backdrop-blur-xl border border-border shadow-lg` para se integrar com o tema
- No mobile, o dock fica com scroll horizontal e magnification reduzida
- A pagina actual sera indicada visualmente com o icone do Dock em cor primaria

### Responsividade

- Desktop: Dock centrado no fundo com magnificacao completa
- Mobile: Dock com scroll horizontal, `magnification={52}`, items mais compactos
- O menu hamburger mobile do header sera removido (o Dock substitui)

Nenhuma dependencia nova. Nenhuma migracao de BD.
