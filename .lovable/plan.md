

# Menu Superior com Dropdowns Agrupados

## Resumo

Reorganizar a navegacao superior para ter itens principais visiveis e alguns agrupados em dropdowns que abrem ao clicar, reduzindo a quantidade de itens na barra e criando uma hierarquia visual mais limpa.

## Estrutura proposta do menu

```text
[Dashboard]  [Atendimento]  [Comercial v]  [Juridico v]  [Gestao v]  [Roadmap]

Comercial (dropdown):        Juridico (dropdown):        Gestao (dropdown):
  - Leads                      - Casos                     - Financeiro
  - Propostas                  - Carteira                  - Automacoes
  - Contratos                                              - Relatorios
```

- **Dashboard** -- link direto (pagina inicial)
- **Atendimento** -- link direto (chat/mensagens)
- **Comercial** -- dropdown com Leads, Propostas, Contratos
- **Juridico** -- dropdown com Casos, Carteira
- **Gestao** -- dropdown com Financeiro, Automacoes, Relatorios
- **Roadmap** -- link direto

## Detalhes Tecnicos

### Ficheiro: `src/components/AppHeader.tsx`

1. **Reestruturar `navItems`** para suportar dois tipos: links diretos e grupos com sub-itens
2. **Usar `DropdownMenu`** (ja importado) para renderizar os grupos
3. Cada dropdown tera:
   - Trigger com icone + nome + seta (ChevronDown)
   - Estilo pill arredondado igual aos links diretos
   - Menu com fundo solido branco (`bg-popover`), z-index alto, sombra
   - Items com icone + texto, ao clicar navega para a rota
4. **Item ativo no dropdown**: Se a rota atual pertence a um grupo, o trigger do dropdown fica com o estilo ativo (`bg-white/25`)
5. **Mobile**: Manter grid com todos os itens expandidos (sem dropdowns no mobile, pois tela de toque funciona melhor com tudo visivel)

### Comportamento
- Clicar no trigger abre o dropdown
- Clicar num sub-item navega para a pagina e fecha o dropdown
- Se a pagina atual e um sub-item de um grupo, o botao do grupo aparece como "ativo"
- Dropdowns com fundo opaco branco para garantir legibilidade (sem transparencia)

### Nenhum ficheiro novo necessario
- Apenas alteracao em `src/components/AppHeader.tsx`
- Reutiliza componentes `DropdownMenu` ja existentes

