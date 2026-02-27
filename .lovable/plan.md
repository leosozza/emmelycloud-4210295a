

## Mapeamento Visual de Campos Bitrix ↔ Supabase

Redesenhar o `FieldMappingManager` para uma interface visual inspirada na imagem de referência (TabuladorMax), com uma tabela unificada mostrando campos Supabase à esquerda, tipo, seta, campo Bitrix selecionável à direita, status (Mapeado/Não mapeado) e ações.

### Layout Proposto

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Mapeamento de Campos                                                │
│ Configure como os campos são sincronizados entre Bitrix e Supabase  │
│                                                                     │
│ [Buscar campo...]  [Mostrar apenas mapeados] [Mostrar ocultos]     │
│ [Lead ▼] [Tabela: Leads ▼]     Total: 11  Mapeados: 5             │
│                                                                     │
│ ☐  Campo Supabase    Tipo    →   Campo Bitrix          Status  Ação│
│ ─────────────────────────────────────────────────────────────────── │
│ ☐  name              text    →   Nome (NAME) string    Mapeado   ✕ │
│ ☐  email             text    →   E-mail (EMAIL) str    Mapeado   ✕ │
│ ☐  phone             text    →   Telefone (PHONE)      Mapeado   ✕ │
│ ☐  country           text    →   [Nenhum ▼]           Não map.     │
│ ☐  notes             text    →   [Nenhum ▼]           Não map.     │
│                                                                     │
│                              [Guardar Mapeamentos]                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Plano de Implementação

#### Passo 1: Reescrever `FieldMappingManager.tsx` com layout visual unificado
- Tabela unificada com colunas Supabase à esquerda (fixas por tabela selecionada)
- Cada linha mostra: checkbox, campo Supabase, tipo, seta `→`, dropdown de campo Bitrix (ou "Nenhum"), status badge, botão remover
- Filtros: busca, toggle "mostrar apenas mapeados", toggle "mostrar campos ocultos"
- Contadores: Total de campos e quantidade mapeada
- Selectors no topo: entidade Bitrix (Lead/Deal) e tabela Supabase (Leads/Casos/Clientes...)
- Dropdown de campo Bitrix mostra título + key + tipo (ex: "Nome — NAME — string")
- Status visual: badge verde "Mapeado" ou badge cinza "Não mapeado"
- Direção de sync selecionável por linha (B→S, S→B, ⇆)

#### Passo 2: Carregar campos Bitrix e pré-preencher mapeamentos salvos
- Usa a mesma lógica existente de fetch via Edge Function `bitrix24-fields`
- Carrega mapeamentos existentes da tabela `bitrix24_field_mappings`
- Faz match automático: se existe mapeamento guardado para um campo Supabase, pré-seleciona o campo Bitrix correspondente

### Detalhes Técnicos

Ficheiro a alterar: `src/components/bitrix24/FieldMappingManager.tsx` (reescrita completa do layout, mantendo a mesma lógica de dados).

