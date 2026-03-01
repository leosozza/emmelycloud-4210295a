

## Configurar Pagamentos: Stripe BR, Stripe PT e Asaas BR

Atualmente a aba Pagamentos mostra apenas 2 cards: **Stripe** (genérico) e **Asaas**. O plano e reorganizar em **3 cards** distintos com credenciais separadas.

### Mudancas na UI (`src/pages/Integracoes.tsx`)

**Card 1 — Stripe Portugal (EUR)**
- Provider: `stripe_pt`
- Credenciais: `STRIPE_SECRET_KEY_PT`, `STRIPE_WEBHOOK_SECRET_PT`
- Descricao: "Portugal / Europa (EUR)"
- Metodos: Cartao, Multibanco, MB WAY, SEPA, etc.
- Teste de conexao usando currency EUR

**Card 2 — Stripe Brasil (BRL)**
- Provider: `stripe_br`
- Credenciais: `STRIPE_SECRET_KEY_BR`, `STRIPE_WEBHOOK_SECRET_BR`
- Descricao: "Brasil (BRL) — Cartao"
- Teste de conexao usando currency BRL + force_gateway stripe
- Layout em grid de 3 colunas (md:grid-cols-3)

**Card 3 — Asaas Brasil (BRL)**
- Mantem como esta (provider `asaas`)
- Credenciais: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENVIRONMENT`
- Descricao: "Brasil (BRL) — PIX, Boleto, Cartao"

### Mudancas no estado

- Adicionar estados de teste separados para cada gateway (`testingStripePT`, `testingStripeBR`, `testingAsaas`)
- Adicionar resultados separados (`stripePtResult`, `stripeBrResult`, `asaasResult`)
- Calcular totais separados por gateway (filtrar transactions por metadata ou credential key)
- Verificar status configurado para cada um individualmente

### Mudancas no Backend (`supabase/functions/payment-create/index.ts`)

- Verificar se ja suporta as chaves regionais `STRIPE_SECRET_KEY_PT` e `STRIPE_SECRET_KEY_BR`
- Se necessario, atualizar para buscar a chave correta baseado no parametro `force_gateway` ou `currency`

### Detalhes Tecnicos

- As credenciais serao guardadas na tabela `integration_credentials` com providers distintos: `stripe_pt`, `stripe_br`, `asaas`
- O card de resumo "Emmely Pay" continua a mostrar todas as transacoes consolidadas
- Nenhuma migracao de base de dados necessaria — apenas novos registos na tabela de credenciais

