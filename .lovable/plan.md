

# Central de Integracoes

## Objetivo

Criar uma nova pagina `/integracoes` que centraliza todas as configuracoes de integracao do sistema em 3 abas organizadas.

## Estrutura da Pagina

```text
Central de Integracoes
+-------------------------------------------------------+
| [CRM]        [Omni Channel]       [Pagamentos]        |
+-------------------------------------------------------+

Aba CRM:
  - Card "Bitrix24" com status da integracao (conectado/desconectado)
  - Card "Emmely Messages" - conector de mensagens (status, canais ativos)
  - Card "Emmely Pay" - conector de pagamento (status)
  - Card "Saude do Sistema" - logs recentes, erros, uptime

Aba Omni Channel:
  - Card "WhatsApp" - configuracao Callbell, status, canal UUID
  - Card "Instagram" - configuracao Callbell, status, canal UUID
  - Card "E-mail" - configuracao SMTP/provider
  - Card "Canais Conectados" - resumo de canais ativos na central de atendimento

Aba Pagamentos:
  - Card "Stripe" - status, chave configurada, modo (test/live)
  - Card "Asaas" - status, placeholder para futura integracao
  - Card "Outros" - placeholder para futuras integracoes
```

## Detalhes Tecnicos

### Ficheiros a criar

1. **`src/pages/Integracoes.tsx`** - Pagina principal com 3 abas usando Tabs do shadcn/ui
   - Usa componentes Card, Badge, Tabs do shadcn
   - Busca dados do backend via `bitrix24-connector-settings?format=json` para status do Bitrix24
   - Busca secrets configurados para mostrar status de cada integracao
   - Cards com indicadores visuais (verde = ativo, vermelho = inativo, amarelo = pendente)

### Ficheiros a modificar

2. **`src/App.tsx`** - Adicionar rota `/integracoes` com o novo componente
3. **`src/components/AppHeader.tsx`** - Adicionar link "Integracoes" no grupo "Gestao" da navegacao (com icone `Plug` do lucide-react)

### Componentes internos da pagina

Cada aba sera uma funcao/componente dentro do ficheiro `Integracoes.tsx`:

- **`CRMTab`** - Mostra status do Bitrix24, Emmely Messages, Emmely Pay e saude
- **`OmniChannelTab`** - Cards para WhatsApp, Instagram, Email com campos de configuracao
- **`PagamentosTab`** - Cards para Stripe, Asaas com status e acoes

### Dados

A pagina usa dados existentes:
- Tabela `bitrix24_integrations` para status do CRM
- Tabela `bitrix24_channel_mappings` para canais ativos
- Tabela `bitrix24_debug_logs` para saude do sistema
- Secrets existentes (CALLBELL_API_TOKEN, META_PAGE_ACCESS_TOKEN, etc.) para indicar o que esta configurado

Nao necessita de novas tabelas - apenas leitura dos dados existentes.

### Design

- Segue o padrao visual das outras paginas (PageHeader com gradiente, cards brancos)
- Icones do lucide-react para cada integracao
- Badges coloridos para status (verde/vermelho/amarelo)
- Cards com accoes como "Configurar", "Testar conexao", "Desconectar"

