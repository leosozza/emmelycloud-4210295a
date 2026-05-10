## Análise da Pipeline 25 (Ação Judicial) → SPA 1118

**561 deals** analisados. Dos 190 campos do pipeline, apenas ~35 têm dados reais. A maioria dos campos jurídicos foi **criada no deal mas nunca preenchida** (ex: Número do processo, Prazo fatal, Audiência) — eles devem viver na SPA, não no deal.

### Campos a CRIAR na SPA 1118

**1. Identificação & Vínculos (nativos da SPA — não criar)**
Title, contactId, companyId, assignedById, stageId, opportunity, currencyId, createdTime — já existem por padrão.

**2. Dados Jurídicos do Processo** (núcleo da SPA)
| Campo SPA | Tipo | Origem deal |
|---|---|---|
| `ufCrm_NUMERO_PROCESSO` | string | Número do processo |
| `ufCrm_URL_PROCESSO` | string (URL) | URL do Processo |
| `ufCrm_VALOR_CONDENACAO` | money | Valor da condenação |
| `ufCrm_PARTE_CONTRARIA` | string | Parte contrária |
| `ufCrm_PARTE_CONTRARIA_TEXTO` | string | Parte contraria (Texto) |
| `ufCrm_CLIENTE_TEXTO` | string | Cliente (Texto) |
| `ufCrm_RESPONSAVEL_TEXTO` | string | Responsável (Texto) |

**3. Prazos**
| Campo SPA | Tipo |
|---|---|
| `ufCrm_TIPO_PRAZO` | enum (lista) |
| `ufCrm_PRAZO_FATAL` | date |
| `ufCrm_PRAZO_ATIVIDADE` | date |
| `ufCrm_DESCRICAO_PRAZO` | string (text) |

**4. Audiências**
| Campo SPA | Tipo |
|---|---|
| `ufCrm_TIPO_AUDIENCIA` | enum |
| `ufCrm_MODALIDADE` | enum (presencial/online) |
| `ufCrm_DATA_HORA_AUDIENCIA` | datetime |
| `ufCrm_LINK_LOCAL_AUDIENCIA` | string |

**5. Identificação Fiscal Cliente**
`ufCrm_NIF` (string), `ufCrm_NISS` (string)

**6. Vínculo de Origem (rastreabilidade)**
| Campo | Tipo | Função |
|---|---|---|
| `ufCrm_DEAL_ORIGEM_ID` | integer | ID do deal original do pipeline 25 |
| `ufCrm_DEAL_ORIGEM_URL` | string | Link direto ao deal (auditoria) |

**7. Financeiro herdado** (apenas se quiser histórico — opcional, recomendo NÃO duplicar pois Emmely Pay já gerencia)
- `ufCrm_DATA_PRIMEIRA_PARCELA` (date)
- `ufCrm_QTD_PARCELAS` (integer)
- `ufCrm_VALOR_PARCELA` (money)

### Campos que NÃO devem ser recriados na SPA
- Toda a sub-suite CPLP/Imigração (Passaporte, PB4, Convidado, etc.) — não pertence ao domínio judicial.
- Tempo na Etapa 1-10, UTM_*, Pós-venda — métricas/marketing fora de escopo.
- Campos `(Apagar)`, duplicatas, `Negócio`, `criar SPA`, `calculadora` — lixo.
- Campos financeiros completos (LINK PAGAMENTO, GATEWAY, TOKEN_PAY, etc.) — já existem em `financial_records` (regra do projeto).

### Etapas do Plano

**Fase 1 — Criar campos na SPA 1118**
- Edge function `bitrix24-spa-create-fields` que chama `crm.item.fields` (leitura) + `userfieldconfig.add` (escrita) com `entityId = "CRM_5"` (ou correspondente ao SPA 1118 — confirmar com `crm.type.get`).
- Cria os ~18 campos listados em §2-§6 (+3 opcionais §7) com labels PT-BR.
- Idempotente: se já existir, pula.

**Fase 2 — Adicionar UF de rastreio reverso no deal (já existe)**
- `UF_CRM_1778431525` confirmado pelo usuário. Não criar.

**Fase 3 — Script de migração (`bitrix24-migrate-deals-to-spa`)**
1. Pagina `crm.deal.list` filtro `CATEGORY_ID=25` (loops de 50, range pattern conforme regra do projeto).
2. Para cada deal:
   - Mapeia os campos preenchidos → payload SPA.
   - `crm.item.add` com `entityTypeId=1118`, vínculos `contactId`/`companyId`/`assignedById`, e `stageId` mapeado conforme tabela "etapas copiadas".
   - Captura o `id` do item criado.
   - `crm.deal.update` no deal original setando `UF_CRM_1778431525 = <novo_id>`.
   - Loga em nova tabela `spa_migration_log` (deal_id, spa_item_id, status, error, timestamp).
3. **Modo dry-run obrigatório** primeiro: gera CSV de pré-visualização sem escrever.
4. **Mapa de etapas** (Fase ↔ stageId SPA) — preciso que você forneça ou eu extraio comparando os 2 kanbans via `crm.dealcategory.stage.list` (cat 25) vs `crm.status.list` (DYNAMIC_1118_STAGE_0).

**Fase 4 — UI**
Tela "Migração Pipeline 25 → SPA Ação Judicial" em Configurações:
- Botão "Criar campos na SPA" (Fase 1)
- Pré-visualização (dry-run) com tabela e contagem
- Botão "Executar migração" com dupla confirmação
- Log da execução em tempo real

### Antes de implementar, preciso confirmar:

1. **Mapa de etapas**: as etapas da SPA têm exatamente os mesmos nomes das do pipeline 25? Posso fazer match automático por NAME, ou você fornece a tabela?
2. **Campos opcionais §7 (financeiro)**: criar ou ignorar? (Recomendo ignorar — `financial_records` já é a fonte canônica.)
3. **Deals já fechados/perdidos** (status WON/LOSE) também migram, ou apenas abertos?
4. **O que fazer com o deal original** após migração: arquivar, mover de pipeline, ou deixar intacto apenas com o UF preenchido?
