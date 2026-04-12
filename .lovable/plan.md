

# Wizard Passo-a-Passo para Criacao de Agentes IA

## Problema

O formulario actual e um dialog unico com 15+ campos, separadores, termos tecnicos (governance, HITL, temperature, provider), e seccoes condicionais. Um utilizador que nunca criou um agente IA fica perdido.

## Solucao

Substituir o dialog por um **wizard de 5 passos** com progresso visual, explicacoes contextuais em cada passo, e valores inteligentes pre-preenchidos. O utilizador so ve o que precisa em cada momento.

## Os 5 Passos

### Passo 1 — Identidade (Quem e o seu agente?)
- Nome, descricao, tipo (texto/voz/hibrido)
- Estilo de personalidade + tom (com preview de como o agente falaria)
- Objectivo estrategico
- **Dica contextual:** "Dê um nome ao seu agente e escolha como ele se comunica. Ex: 'Sofia' — profissional e empática."

### Passo 2 — Inteligencia (Como ele pensa?)
- Provider + modelo (com recomendacao: "Recomendado para iniciantes" no modelo nativo)
- Temperatura com explicacao visual ("Mais criativo ↔ Mais preciso")
- Opcao de voz (so aparece se tipo = voz/hibrido)
- **Dica:** "O modelo define a 'inteligencia' do agente. Para a maioria dos casos, o modelo recomendado e suficiente."

### Passo 3 — Conhecimento (O que ele sabe?)
- System prompt com template pre-preenchido editavel
- Colecoes de knowledge base (com explicacao: "Adicione documentos para o agente consultar")
- Fluxo padrao
- **Dica:** "Ensine ao agente sobre o seu negocio. Pode escrever instrucoes ou vincular documentos."

### Passo 4 — Habilidades (O que ele pode fazer?)
- Skills com switches + explicacao inline de cada uma
- Sub-agentes (com explicacao: "O agente pode delegar tarefas a outros agentes")
- **Dica:** "Active as ferramentas que o agente pode usar. Comece com poucas e adicione conforme necessario."

### Passo 5 — Revisao e Publicacao
- Resumo visual tipo card com tudo configurado
- Mensagem de boas-vindas e fallback editaveis
- Toggle activo/inactivo + definir como padrao
- Botao "Criar Agente" ou "Guardar"
- **Dica:** "Revise as configuracoes. Pode alterar tudo depois."

## UI do Wizard

- Barra de progresso no topo com 5 circulos numerados e labels
- Botoes "Voltar" e "Proximo" no footer
- Cada passo tem um titulo grande, subtitulo explicativo, e uma dica lateral
- Animacao suave de transicao entre passos
- O dialog ocupa `max-w-3xl` para dar espaco as explicacoes

## Detalhes Tecnicos

### Ficheiros a alterar

| Ficheiro | Accao |
|---|---|
| `src/components/agentes/AgentFormDialog.tsx` | Reescrever como wizard multi-step |
| `src/pages/Agentes.tsx` | Sem alteracoes significativas (a interface ja passa os props correctos) |

### Notas
- A logica de save (`onSave`) nao muda — so e chamada no ultimo passo
- Os skills continuam a so aparecer em modo edicao (agente ja criado), com nota explicativa no passo 4 para novos agentes
- Governanca (autonomo/supervisionado/restrito) fica no passo 4 junto com skills, com linguagem simplificada: "O agente pode agir sozinho?" em vez de "Modo de Governanca"
- Budget fica no passo 2 junto com o modelo, como "Limite de custo mensal (opcional)"

