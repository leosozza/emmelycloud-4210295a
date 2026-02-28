

## Treinamento Unificado - Coleções de Conhecimento

Reestruturar a página de Treinamento para que cada "treinamento" seja uma coleção que agrupa texto, ficheiros e URLs sob um único título temático.

### Conceito

Atualmente, cada documento é criado isoladamente (só texto, OU só ficheiro, OU só URL). A nova abordagem permite criar um "Treinamento de Vendas" que inclui tudo junto:
- Um texto descritivo sobre vendas
- 5 PDFs com materiais de apoio
- 2 URLs de referência

Tudo agrupado visualmente como um único treinamento.

### Alterações na Base de Dados

Adicionar coluna `collection_id` e `collection_name` à tabela `knowledge_documents`:
- `collection_id` (UUID, nullable) -- agrupa documentos da mesma coleção
- `collection_name` (text, nullable) -- nome do treinamento/coleção

Documentos com o mesmo `collection_id` pertencem ao mesmo treinamento.

### Novo Diálogo de Criação

Substituir as tabs de tipo único por um formulário unificado com 3 secções visíveis simultaneamente:

1. **Título do Treinamento** (obrigatório) -- ex: "Treinamento de Vendas"
2. **Texto** (opcional) -- textarea para colar/escrever conteúdo
3. **Ficheiros** (opcional) -- zona de drag-and-drop para upload múltiplo (mantém os limites actuais de 50MB/ficheiro e 20 ficheiros)
4. **URLs** (opcional) -- campo para adicionar uma ou mais URLs

O utilizador preenche o que quiser e ao guardar, cada tipo vira um `knowledge_document` separado mas todos partilham o mesmo `collection_id`.

### Listagem Agrupada

Na lista principal, os documentos com o mesmo `collection_id` aparecem agrupados num card expansível:
- Card principal mostra o título do treinamento, quantidade total de documentos e chunks
- Ao expandir, mostra os itens individuais (texto, ficheiros, URLs) com ações de visualizar/eliminar
- Documentos sem `collection_id` (legados) aparecem normalmente como cards individuais

### Edição de Treinamento

O botão de edição numa coleção abre o diálogo unificado preenchido com os dados existentes:
- O texto existente aparece no textarea
- Os ficheiros carregados são listados (com opção de remover individualmente)
- As URLs são listadas (com opção de remover)
- Pode adicionar mais texto, ficheiros ou URLs ao treinamento existente

### Detalhes Técnicos

**Migração SQL:**
```text
ALTER TABLE knowledge_documents
  ADD COLUMN collection_id UUID DEFAULT NULL,
  ADD COLUMN collection_name TEXT DEFAULT NULL;
```

**Ficheiro a alterar: `src/pages/Training.tsx`**

- Novo estado `newTraining` com campos: `title`, `content`, `urls: string[]`, `files: File[]`
- Função `handleCreateTraining` que gera um `collection_id`, cria documento de texto (se houver), faz upload dos ficheiros, cria documentos de URL -- todos com o mesmo `collection_id` e `collection_name`
- Agrupamento na listagem: `Map<string, KnowledgeDocument[]>` agrupando por `collection_id`
- Componente de card expansível usando `Collapsible` (já disponível no projecto)
- Manter o diálogo de Conversas como tab separada (esse fluxo é diferente)

**Compatibilidade:**
- Documentos existentes (sem `collection_id`) continuam a funcionar normalmente, mostrados como cards individuais
- A eliminação de uma coleção elimina todos os documentos e ficheiros associados

