

## Enriquecer Clientes com ID Contacto Bitrix24 via CSV

### Objectivo
Importar o CSV de contactos do Bitrix24 e actualizar a coluna `bitrix24_id` na tabela `clients`, usando a coluna `EF` (= `id_access`) como chave de correspondência e `ID` como o ID de contacto Bitrix24.

### Implementação

**Ficheiro: `src/pages/Bitrix24App.tsx`** — Na `ImportacaoAccessView`, adicionar um novo bloco "Enriquecer Contactos Bitrix" (antes ou após as 3 fases existentes):

1. **UI**: Botão de upload de CSV com label "Importar IDs Contacto Bitrix24"
2. **Parser**: Ler CSV separado por `;`, extrair colunas `EF` e `ID` (remover aspas)
3. **Matching**: Para cada linha do CSV:
   - Buscar cliente na tabela `clients` onde `id_access = EF`
   - Se encontrado e `bitrix24_id` está vazio, fazer `UPDATE clients SET bitrix24_id = ID WHERE id_access = EF`
4. **Feedback**: Barra de progresso + contadores (encontrados, actualizados, não encontrados)
5. **Resultado**: Resumo final com totais

### Lógica de Parse
```typescript
// CSV: "EF";"...";"...";"ID";
// Separador: ;
// Valores entre aspas
const rows = text.split("\n").slice(1); // skip header
for (const row of rows) {
  const cols = row.split(";").map(c => c.replace(/^"|"$/g, "").trim());
  const ef = cols[0];  // EF = id_access
  const id = cols[22]; // ID = bitrix24 contact id
  if (ef && id) { /* update client */ }
}
```

### Execução
- Batch update directo via Supabase client (sem edge function)
- Processar em lote de 50 para evitar sobrecarga
- Sem alterações de schema necessárias (a coluna `bitrix24_id` já existe na tabela `clients`)

