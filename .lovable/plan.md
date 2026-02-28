

## Upload em Lote de Ficheiros na Pagina de Treinamento

Permitir selecionar e enviar multiplos ficheiros de uma vez na aba "Ficheiro" do dialog de criacao de documentos, com limite de tamanho por ficheiro.

### Alteracoes

**Ficheiro: `src/pages/Training.tsx`**

1. **Estado** -- Substituir `selectedFile: File | null` por `selectedFiles: File[]` e adicionar estado de progresso (`uploadProgress: number` para tracking visual).

2. **Input de ficheiro** -- Alterar o `<input type="file">` para aceitar `multiple`. No `onChange`, acumular ficheiros validando:
   - Tamanho maximo por ficheiro: **50MB** (limite do Supabase Storage)
   - Ficheiros que excedam o limite serao rejeitados com toast de erro
   - Maximo de 20 ficheiros por lote

3. **Area de drop** -- Quando houver ficheiros selecionados, mostrar lista com nome + tamanho + botao para remover individualmente, em vez de mostrar apenas um ficheiro.

4. **Titulo** -- Como serao multiplos ficheiros, o campo titulo sera preenchido automaticamente com o nome de cada ficheiro (sem extensao). O campo titulo manual sera removido para uploads em lote, pois cada ficheiro tera o seu proprio titulo.

5. **Funcao `handleFileUpload`** -- Refatorar para iterar sobre `selectedFiles`, fazendo upload de cada um sequencialmente:
   - Upload para storage `knowledge-files`
   - Criar documento + chunks para cada ficheiro
   - Atualizar barra de progresso (`Progress` component)
   - Toast final com contagem de sucesso/erro

6. **Barra de progresso** -- Adicionar componente `Progress` (ja existe em `ui/progress.tsx`) durante o upload em lote, mostrando "Enviando 3/10...".

7. **Botao de enviar** -- Texto atualizado para refletir quantidade: "Enviar X Ficheiros".

### Limites aplicados

| Restricao | Valor |
|-----------|-------|
| Tamanho maximo por ficheiro | 50 MB |
| Ficheiros por lote | 20 |
| Tipos aceites | TXT, MD, CSV, JSON, XML, PDF, DOCX, DOC |

### Detalhes Tecnicos

- Sem alteracoes no backend ou base de dados -- reutiliza `createDocWithChunks` e storage existente
- Progresso visual usando `Progress` de `@/components/ui/progress`
- Validacao client-side antes de iniciar uploads
- Ficheiros invalidos (tamanho) sao filtrados com feedback imediato

