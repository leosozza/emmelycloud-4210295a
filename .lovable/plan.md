

## Melhorias na Pagina de Treinamento

Corrigir o erro de tela branca no upload, adicionar drag-and-drop de ficheiros e permitir edicao de documentos existentes.

### 1. Corrigir tela branca no upload de ficheiros

A zona de drop nao tem handlers de drag/drop, e o componente pode crashar se um erro nao tratado ocorrer durante o upload (ex: bucket nao acessivel, erro de RLS). A correcao inclui:
- Envolver o `handleFileUpload` com try/catch robusto e logging
- Adicionar `onError` handler no upload para evitar que erros nao capturados propaguem e derrubem o componente
- Adicionar um error boundary basico ou state de erro para evitar tela branca

### 2. Adicionar drag-and-drop de ficheiros

Na area pontilhada de upload ("Clique para selecionar ficheiros"), adicionar:
- Handlers `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`
- Estado visual de highlight quando ficheiros sao arrastados sobre a area
- Reutilizar a funcao `addFiles()` existente para validacao

### 3. Adicionar edicao de documentos existentes

Permitir que o utilizador edite titulo e conteudo de documentos ja criados:
- Adicionar botao de edicao (icone `Pencil`) ao lado do botao de visualizacao em cada card
- Criar dialog de edicao que carrega os dados do documento selecionado
- Campos editaveis: titulo, conteudo (texto), source_url (se tipo URL)
- Ao salvar, atualizar o documento na base de dados e regenerar chunks se o conteudo mudar
- Para ficheiros, permitir apenas a edicao do titulo (o ficheiro em si nao e editavel inline)

### Detalhes Tecnicos

**Ficheiro a alterar: `src/pages/Training.tsx`**

**Drag-and-drop:**
- Adicionar estado `isDragging: boolean` para controlar o visual
- Na `div` da area de drop, adicionar `onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}`, `onDragLeave`, e `onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); setIsDragging(false); }}`
- Aplicar classe condicional `border-primary bg-primary/5` quando `isDragging`

**Edicao:**
- Novo estado `editDoc: KnowledgeDocument | null`
- Novo dialog com campos de titulo + conteudo (textarea) + source_url
- Funcao `handleEdit` que faz `update` na tabela `knowledge_documents`, deleta chunks antigos e recria se o conteudo mudar
- Botao `Pencil` em cada card de documento

**Correcao tela branca:**
- Envolver o render do componente com tratamento de erro
- Garantir que `createDocWithChunks` nao lanca excecoes nao tratadas no loop de upload
- Adicionar `console.error` no catch interno para diagnostico

