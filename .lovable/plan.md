

## Problema

A tabela `leads` tem o campo `name` com nomes genéricos ("Cliente 5", "Cliente 60", etc.) vindos da importação do Access. Porém, o `client_id` está corretamente vinculado à tabela `clients` que contém os nomes reais (ex: "LUCAS BERNARDES DE ASSIS RIBEIRO").

## Solução

Executar um UPDATE em massa para copiar o nome real da tabela `clients` para o campo `leads.name`:

```sql
UPDATE leads l
SET name = c.name
FROM clients c
WHERE l.client_id = c.id
  AND l.client_id IS NOT NULL;
```

Isto corrige os 1705 registos de uma vez. Nenhuma alteração de código é necessária — o campo `name` passa a ter o valor correto.

### Ficheiros alterados
Nenhum ficheiro de código. Apenas uma operação de dados (UPDATE) na tabela `leads`.

