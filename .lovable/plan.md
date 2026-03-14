

## Análise do Fluxo Actual de Envio de Proposta

Embora não tenha sido possível ler o ficheiro `.bpt` (formato binário Bitrix24), analisei todo o código que implementa o fluxo de propostas end-to-end. Abaixo está o mapeamento completo e as falhas identificadas.

---

### Fluxo Actual Mapeado

```text
                    ┌─────────────────────┐
                    │  2 Pontos de Entrada │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
    ┌──────────────────┐              ┌──────────────────────┐
    │ UI: Propostas.tsx │              │ Bitrix24 Robot       │
    │ (formulário manual)│             │ emmely_generate_     │
    │                   │              │ proposal             │
    └────────┬──────────┘              └──────────┬───────────┘
             │                                    │
             │ insert proposals                   │ 1. crm.deal.get / crm.lead.get
             │ status: rascunho                   │ 2. crm.contact.get
             │                                    │ 3. insert cases (auto-criado)
             │                                    │ 4. insert proposals status: enviada
             │                                    │ 5. invoke proposal-pdf
             │                                    │ 6. return proposal_url + pdf_url
             ▼                                    ▼
    ┌──────────────────────────────────────────────────────┐
    │                 Tabela: proposals                     │
    │  (title, case_id, value, payment_type, installments, │
    │   client_*, accept_token, status, pdf_url)           │
    └────────────────────────┬─────────────────────────────┘
                             │
                    ┌────────┼────────┐
                    ▼                 ▼
        ┌────────────────┐  ┌──────────────────┐
        │ proposal-pdf   │  │ PropostaPublica  │
        │ (Edge Function)│  │ /proposta/:token │
        │ Gera HTML →    │  │ Página de aceite │
        │ upload storage │  │ pelo cliente     │
        └────────────────┘  └────────┬─────────┘
                                     │
                                     │ Cliente clica "Aceitar"
                                     ▼
                            ┌──────────────────┐
                            │ 1. proposals →   │
                            │    status: aceita │
                            │ 2. insert        │
                            │    contracts     │
                            │ 3. leads →       │
                            │    funnel_stage:  │
                            │    contrato      │
                            └──────────────────┘
```

---

### Falhas e Problemas Identificados

#### 1. CRÍTICO — "PDF" não é PDF, é HTML
O `proposal-pdf/index.ts` gera um ficheiro **HTML** e faz upload ao storage como `text/html`. O campo chama-se `pdf_url` mas aponta para um `.html`. Isto causa:
- Clientes que esperam descarregar um PDF recebem uma página HTML
- Impressão inconsistente (depende do browser do cliente)
- Falta de profissionalismo num contexto jurídico

**Correcção:** Usar um serviço de conversão HTML→PDF (ex: Puppeteer via API, ou jsPDF no Edge Function) para gerar um PDF real.

#### 2. IMPORTANTE — Duplicação de lógica de aceite
O aceite de proposta está implementado em **dois locais independentes** com lógica divergente:
- **`PropostaPublica.tsx`** (L44-62): Cliente aceita via link público → cria contrato + actualiza lead
- **`Propostas.tsx`** (L117-135): Admin aceita manualmente no backoffice → cria contrato + actualiza lead

Ambos fazem a mesma coisa mas de forma duplicada. Se a lógica mudar (ex: enviar email, notificar Bitrix24), é preciso alterar em dois sítios.

**Correcção:** Centralizar a lógica de aceite numa Edge Function `proposal-accept` que ambos chamam.

#### 3. IMPORTANTE — Aceite público sem autenticação nem verificação
A página `PropostaPublica.tsx` permite que **qualquer pessoa com o link** aceite a proposta. Não há:
- Verificação de identidade (email, código OTP)
- Confirmação de leitura dos termos
- Registo de IP/user-agent para prova legal
- Protecção contra aceite acidental (confirmação dupla)

Para um escritório de advocacia, isto é um risco legal significativo.

**Correcção:** Adicionar pelo menos: confirmação com checkbox "Li e aceito", registo de IP/user-agent/timestamp na tabela `proposals`, e opcionalmente verificação por código enviado ao email.

#### 4. IMPORTANTE — Robot Bitrix24 cria caso "fantasma"
O `handleGenerateProposal` (L538-547) cria automaticamente um `case` genérico para vincular à proposta. Este caso:
- Tem `legal_area: "outro"` hardcoded
- Não está vinculado a nenhum lead existente
- Não verifica se já existe um caso para aquele deal/lead no Bitrix24

Resultado: acumulação de casos órfãos na base de dados.

**Correcção:** Procurar caso existente pelo `bitrix24_id` do lead antes de criar um novo. Se não existir lead, criar lead primeiro e depois o caso.

#### 5. MODERADO — Sem notificação ao cliente após aceite
Quando o cliente aceita a proposta, não há:
- Email de confirmação
- Mensagem WhatsApp automática
- Notificação ao advogado responsável

O sistema actualiza o banco de dados silenciosamente.

**Correcção:** Após aceite, enviar notificação ao responsável (tabela `notifications`) e opcionalmente enviar confirmação por email/WhatsApp ao cliente.

#### 6. MODERADO — Sem controlo de expiração automática
As propostas têm `valid_until` mas não há job/cron que marque propostas expiradas automaticamente. O status só muda quando alguém acede a página.

**Correcção:** Criar um pg_cron job que execute `UPDATE proposals SET status = 'expirada' WHERE valid_until < now() AND status = 'enviada'`.

#### 7. MENOR — XSS no HTML do PDF
O `proposal-pdf/index.ts` injeta `proposal.title`, `proposal.description`, `proposal.conditions` directamente no HTML sem sanitização. Se um campo contiver `<script>`, será executado no browser.

**Correcção:** Sanitizar todos os campos antes de injectar no template HTML (escape de `<`, `>`, `&`, `"`).

#### 8. MENOR — URL hardcoded no robot
O `handleGenerateProposal` (L582) tem `https://emmelycloud.lovable.app` hardcoded. Se o domínio mudar, o robot gera links errados.

**Correcção:** Usar variável de ambiente `FRONTEND_URL` ou construir a partir do `SUPABASE_URL`.

---

### Plano de Implementação (por prioridade)

| # | Melhoria | Ficheiros | Esforço |
|---|----------|-----------|---------|
| 1 | **Centralizar lógica de aceite** numa Edge Function `proposal-accept` com registo de IP/user-agent e notificação | Nova EF + `PropostaPublica.tsx` + `Propostas.tsx` | Médio |
| 2 | **Expiração automática** via pg_cron job para marcar propostas expiradas | Migration SQL | Baixo |
| 3 | **Sanitização XSS** no template HTML do proposal-pdf | `proposal-pdf/index.ts` | Baixo |
| 4 | **Notificação ao responsável** quando proposta é aceita (inserir em `notifications`) | `proposal-accept` EF | Baixo |
| 5 | **Evitar casos fantasma** no robot — buscar caso existente antes de criar | `bitrix24-robot-handler/index.ts` | Baixo |
| 6 | **URL dinâmica** em vez de hardcoded no robot | `bitrix24-robot-handler/index.ts` | Baixo |
| 7 | **Confirmação de aceite** com checkbox e registo de evidência legal | `PropostaPublica.tsx` | Baixo |

### Resumo

O fluxo de propostas funciona end-to-end mas tem **falhas de robustez, segurança e profissionalismo** significativas para um contexto jurídico. As correcções mais impactantes são: centralizar a lógica de aceite, adicionar evidência legal no aceite público, e implementar expiração automática. A questão do "PDF falso" (HTML disfarçado) é visível para o cliente mas mais complexa de resolver sem serviço externo de renderização.

