

# Reconstruir o Editor de Fluxos - Replicar ThothAI

## Problema Atual
O editor de flows atual e extremamente basico:
- Nos genericos sem componente visual customizado (usa o "default" do ReactFlow)
- Sem painel de configuracao ao clicar num no
- Sem drag-and-drop da paleta para o canvas
- Sem categorias organizadas de nos
- Sem preview de conteudo nos nos (mensagem, botoes, etc.)
- Sem undo/redo
- Sem simulador de teste
- Sem duplicar no/fluxo
- Sem exportar/importar fluxos nativos
- Sem handles multiplos (botoes, condicoes)

## O que sera implementado

### 1. FlowNodeTypes.ts - Tipos e Categorias de Nos
Ficheiro com toda a definicao dos tipos de nos organizados por categoria:

**Categorias:**
- Mensagens: Mensagem Simples, Mensagem com Botoes, Media, Localizacao, Contato vCard, Sticker
- Logica: Condicao, Aguardar Resposta, Delay, Capturar Resposta, Loop
- Integracoes: Webhook, Definir Variavel
- Controle: Resposta IA, Alternar Persona, Transferir Humano, Voltar para IA, Encerrar Fluxo

**Interface FlowNodeData** com todas as propriedades:
- message, buttons, mediaUrl, mediaType
- condition (type, field, value, timeout)
- variable (name, value, scope)
- webhook (url, method, headers, body)
- personaId, prompt, delay, department
- pollOptions, listSections, inputCapture

### 2. CustomFlowNode.tsx - Componente Visual dos Nos
Componente React que renderiza cada no com:
- Icone colorido e label do tipo
- Preview da mensagem (primeiros 60 caracteres)
- Preview dos botoes de resposta rapida
- Handle de entrada (topo) e saida (fundo)
- Handles multiplos para condicoes e botoes (um por opcao)
- Handles de loop (loop + sair)
- Borda colorida por tipo + ring de selecao

### 3. FlowNodePalette.tsx - Paleta Lateral com Drag-and-Drop
Painel lateral esquerdo com:
- Pesquisa de blocos por nome
- Accordion por categoria (Mensagens, Logica, Integracoes, Controle)
- Cada bloco arrastavel (draggable) OU clicavel
- Icone + label + badge de contagem por categoria
- Botao para colapsar/expandir a paleta
- Referencia de variaveis disponiveis no rodape

### 4. NodeConfigPanel.tsx - Painel de Configuracao
Painel lateral direito que abre ao clicar num no:
- Campo "Nome do bloco" (label editavel)
- Configuracao especifica por tipo:
  - **Mensagem**: Textarea para texto, dica de variaveis
  - **Mensagem com Botoes**: Textarea + lista de botoes (max 3) com add/remove/reorder
  - **Media**: Tipo (imagem/video/audio/doc) + URL
  - **Condicao**: Tipo de condicao + campo + valor
  - **Delay**: Segundos de espera
  - **Resposta IA**: Selector de persona + prompt personalizado
  - **Webhook**: URL + metodo (GET/POST/PUT) + headers + body + variavel de resposta
  - **Variavel**: Nome + valor + escopo (conversa/contato)
  - **Transferir**: Departamento + mensagem de transferencia
  - **Capturar Resposta**: Pergunta + nome variavel + tipo validacao + timeout
- Botao "Excluir bloco" e "Fechar"
- Minimizavel

### 5. Flows.tsx - Refactoring Completo do Editor

**Editor Header:**
- Botoes Undo/Redo com atalhos (Ctrl+Z / Ctrl+Shift+Z)
- Botao Salvar
- Botao Testar (abre simulador)
- Botao Exportar JSON

**Canvas:**
- Paleta lateral esquerda (FlowNodePalette)
- ReactFlow com customNodeTypes registados
- Drop zone com feedback visual ao arrastar
- Click em no abre NodeConfigPanel a direita
- Click em edge permite excluir
- Panel inferior com instrucoes de uso
- Panel contextual com Duplicar/Excluir no selecionado

**Lista de Fluxos:**
- Manter cards existentes
- Adicionar botao Duplicar e Exportar por fluxo
- Manter importacao PowerBot

### 6. useFlowHistory.ts - Hook de Undo/Redo
- Pilha de estados (nodes + edges)
- pushState(), undo(), redo()
- canUndo, canRedo flags
- Atalhos de teclado Ctrl+Z e Ctrl+Shift+Z

## Detalhes Tecnicos

### Ficheiros a criar:
- `src/components/flows/FlowNodeTypes.ts` - Tipos, categorias, interfaces
- `src/components/flows/CustomFlowNode.tsx` - Componente visual de no
- `src/components/flows/FlowNodePalette.tsx` - Paleta lateral com drag-and-drop
- `src/components/flows/NodeConfigPanel.tsx` - Painel de configuracao de no
- `src/hooks/useFlowHistory.ts` - Hook undo/redo

### Ficheiros a modificar:
- `src/pages/Flows.tsx` - Refactoring completo do editor

### Funcionalidades incluidas:
- Custom node rendering com icones, cores, previews
- Drag-and-drop da paleta para o canvas
- Painel de configuracao contextual por tipo de no
- Undo/Redo com atalhos de teclado
- Duplicar nos e fluxos
- Exportar fluxo para JSON
- Handles multiplos para botoes e condicoes
- Feedback visual ao arrastar, selecionar edges
- Manter compatibilidade com importacao PowerBot

