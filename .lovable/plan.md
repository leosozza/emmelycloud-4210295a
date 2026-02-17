
# Plano por Fases: Sistema Funcional End-to-End

## Resumo do Teste Realizado

Testei o fluxo completo e identifiquei o que funciona e o que precisa de correcao:

### O que FUNCIONA:
1. Central de Atendimento mostra conversas correctamente
2. Botao "Criar Lead a partir desta conversa" pre-preenche o formulario com dados do contacto (nome, email, telefone, origem)
3. Lead criado aparece no Kanban no estagio correcto
4. Triagem inline funciona -- seleccao de area juridica, urgencia e avancar para "Proposta"
5. Caso juridico criado automaticamente ao avancar para estagio avancado
6. Logica de assinatura de contrato actualiza lead para "fechado" e caso para "em_andamento"

### O que esta PARTIDO:
1. **Bug critico: Navegacao Leads -> Propostas crasha** -- Ao clicar "Criar Proposta" no LeadSheet, o Radix Sheet portal conflitua com o React Router, causando erro `removeChild` e pagina em branco
2. **conversation_id nao esta a ser guardado** -- O lead da Maria Silva foi criado sem o `conversation_id` vinculado

---

## Fase 1: Corrigir Bugs Criticos (Prioridade Maxima)

### 1.1 Corrigir navegacao Sheet -> React Router

O problema e que o Radix Sheet usa portais DOM que conflituam com o React Router ao desmontar simultaneamente. A solucao e:

- Em `LeadSheet.tsx`: em vez de navegar directamente, emitir um callback `onNavigate` que o componente pai (`Leads.tsx`) executa
- Em `Leads.tsx`: no `handleCreateProposal`, fechar o sheet e usar `requestAnimationFrame` + `setTimeout` (600ms) para garantir que o portal esta completamente removido antes da navegacao
- Alternativa mais robusta: usar `onAnimationEnd` event do sheet para saber quando a animacao terminou, ou usar `flushSync` para forcar a remocao sincrona do portal

### 1.2 Corrigir vinculacao do conversation_id

No `LeadForm.tsx`, garantir que o campo `conversation_id` dos dados de prefill e incluido no objecto enviado ao `onSave`.

---

## Fase 2: Completar o Fluxo Proposta -> Contrato -> Caso

### 2.1 Pagina de Propostas -- Formulario com caso pre-seleccionado

Verificar que o `PropostaForm` abre correctamente com o caso pre-seleccionado quando navegado via query param `case_id`.

### 2.2 Fluxo de aceitar proposta

- Proposta criada como "rascunho"
- Enviar proposta (status "enviada")  
- Aceitar proposta (status "aceita") -> cria contrato automaticamente e actualiza lead para "contrato"

### 2.3 Assinatura do contrato

- Ao assinar: contrato fica "assinado", caso fica "em_andamento", lead fica "fechado"
- Ja esta implementado em `Contratos.tsx`

---

## Fase 3: Pagina de Triagem Dedicada

### 3.1 Implementar a pagina `/triagem`

A pagina `Triagem.tsx` esta vazia. Implementar como uma vista filtrada dos leads no estagio "triagem":

- Lista/tabela de leads pendentes de triagem
- Acesso rapido ao detalhe do lead com triagem inline
- Indicadores de SLA (tempo restante)
- Contadores de leads por urgencia

---

## Fase 4: Rastreabilidade e Navegacao

### 4.1 Breadcrumbs de rastreabilidade

Em cada entidade (Lead, Caso, Proposta, Contrato), mostrar o caminho completo:
- Conversa de origem -> Lead -> Caso -> Proposta -> Contrato

### 4.2 Links entre entidades

- No detalhe do Caso: link para o Lead de origem e conversas vinculadas
- No detalhe do Contrato: link para a Proposta e o Caso
- No detalhe da Proposta: link para o Caso

---

## Fase 5: Autenticacao e Seguranca

### 5.1 Login e Registo

- Implementar pagina de autenticacao com login/signup
- Integrar com o sistema de roles existente (admin, comercial, advogado, financeiro)

### 5.2 Politicas RLS baseadas em roles

- Remover as politicas permissivas (anon) adicionadas para testes
- Activar as politicas baseadas em roles que ja existem na base de dados
- Proteger rotas no frontend com verificacao de autenticacao

---

## Fase 6: Melhorias e Polimento

### 6.1 Notificacoes em tempo real

- Notificacao quando um novo lead chega
- Alerta de SLA a expirar
- Notificacao quando uma proposta e aceita

### 6.2 Dashboard actualizado

- KPIs do funil (conversao por estagio)
- Leads por area juridica
- Tempo medio de conversao

### 6.3 Integracao com canais reais

- Webhook para WhatsApp Business API
- Integracao com Instagram API
- Processamento de emails recebidos

---

## Detalhes Tecnicos

### Bug removeChild -- Solucao proposta

```text
// LeadSheet.tsx -- Nao navegar dentro do Sheet
// Em vez disso, passar a URL de destino via callback

// Leads.tsx -- handleCreateProposal
const handleCreateProposal = async (lead: Lead) => {
  const caseId = await ensureCaseForLead(lead);
  // 1. Fechar sheet
  setSheetOpen(false);
  setSheetLead(null);
  // 2. Esperar que o portal DOM seja completamente removido
  // Usar um ref para detectar quando onOpenChange(false) completa
  pendingNavigationRef.current = `/propostas?case_id=${caseId}`;
};

// No handleSheetOpenChange, verificar com timeout maior:
const handleSheetOpenChange = (open) => {
  setSheetOpen(open);
  if (!open && pendingNavigationRef.current) {
    const target = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    requestAnimationFrame(() => {
      setTimeout(() => navigate(target), 350);
    });
  }
};
```

### Ordem de execucao recomendada

1. Fase 1 (bugs criticos) -- imediato
2. Fase 2 (fluxo completo) -- validar apos Fase 1
3. Fase 3 (triagem dedicada) -- 1 sessao
4. Fase 4 (rastreabilidade) -- 1 sessao
5. Fase 5 (autenticacao) -- 1-2 sessoes
6. Fase 6 (melhorias) -- continuo
