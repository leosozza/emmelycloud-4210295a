

# Emmely Cloud — CRM Jurídico Premium com IA

## Visão Geral
Plataforma de gestão jurídica completa para escritórios de advocacia em Portugal, com design profissional e limpo (azul escuro, cinza, tons sóbrios), focada em produtividade e conversão de leads.

---

## Estrutura do App

### Layout Principal
- **Sidebar** com navegação por módulos (colapsável)
- **Header** com busca global, notificações e perfil do usuário
- **Área de conteúdo** responsiva

### Perfis de Usuário (4 roles)
- **Admin** — acesso total
- **Advogado** — casos, leads atribuídos, propostas
- **Comercial** — leads, funil, métricas de conversão
- **Financeiro** — pagamentos, parcelas, receitas

---

## Módulo 1: Dashboard Principal
- Cards de métricas: leads novos, SLA expirando, receita do mês, taxa de conversão
- Gráfico de leads por origem (WhatsApp, Instagram, Email, Landing Page)
- Receita por área jurídica (Previdência, Cidadania, Vistos, etc.)
- Performance por advogado
- Previsão de faturamento baseada no funil atual

## Módulo 2: Gestão de Leads & Funil
- **Visão Kanban** com colunas: Lead → Triagem → Proposta → Análise → Contrato → Financeiro → Fechado
- Drag & drop entre etapas
- Cada card mostra: nome, país, tipo de caso, score, SLA restante
- Filtros por origem, área jurídica, advogado, urgência
- **SLA 24h** com indicadores visuais (verde/amarelo/vermelho)
- Registro de origem (WhatsApp, Instagram, Email, Landing Page)
- Formulário de cadastro manual de leads

## Módulo 3: Triagem com IA
- Classificação automática da área jurídica com score de confiança
- Score de viabilidade do caso (alta/média/baixa)
- Score de valor estimado do lead
- Resumo automático de conversas e interações
- Sugestão de próximos passos
- Detecção de leads "curiosos" vs. "reais"

## Módulo 4: Gestão de Casos Jurídicos
- Ficha completa do caso vinculada ao lead
- Área jurídica, advogado responsável, status
- Checklist de documentos necessários
- Parecer interno e viabilidade
- Timeline de atividades e histórico

## Módulo 5: Propostas
- Criação de propostas com valores e condições
- Tipos: Fixo, Êxito, Híbrido, Parcelado
- IA sugere faixa de honorários baseada no histórico
- Status: Enviada, Aceita, Recusada, Expirada
- Geração de PDF da proposta

## Módulo 6: Contratos
- Upload de contrato
- Status de assinatura (Pendente, Assinado, Cancelado)
- Data de início e vigência
- Vinculação com proposta e caso

## Módulo 7: Financeiro
- **Stripe** para pagamentos com cartão e links de pagamento
- Registro de transferências bancárias com upload de comprovante
- Controle de parcelamento direto com status por parcela (Paga, Atrasada, Vencendo)
- IA de previsão de inadimplência
- Visão de receita por área jurídica e por período
- Conciliação de pagamentos

## Módulo 8: Automações & Cadências
- Timer de SLA 24h por lead com alertas visuais
- Regras de follow-up automático (1h, 12h, 24h)
- Alertas para gestores sobre leads parados
- Nutrição automática de leads frios com conteúdos
- Radar de oportunidades (sugestão de upsell)

## Módulo 9: Relatórios & Inteligência
- Tempo médio de resposta por advogado
- Taxa de conversão por etapa do funil
- Receita por área jurídica
- Benchmark interno (qual advogado converte mais, qual canal é melhor)
- Previsão de faturamento mensal

---

## Backend (Lovable Cloud + Supabase)
- Autenticação com controle de roles
- Base de dados para leads, casos, propostas, financeiro
- Edge functions para lógica de IA (usando Lovable AI)
- Integração Stripe para pagamentos
- Sistema preparado para futura integração com Bitrix24 e canais de mensageria

