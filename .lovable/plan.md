
Diagnóstico objetivo (com evidência):
- A Fase 3 não está “vazia” de dados no banco: existem 1.019 clientes importados com financeiro.
- O endpoint de Fase 3 atualmente está devolvendo apenas 10 por chamada (`processed: 10`, `has_more: true`, `next_batch_start: 10`), enquanto o frontend foi alterado para chamada única.
- Resultado: a tela parece “não carregar” (ou carregar pouco), e ainda pode abrir em combinação de filtros sem itens (Etapa A + Atrasados), dando impressão de zero.

Plano de correção:

1) Corrigir contrato da API da Fase 3 (backend function)
- Ajustar `import-access-data` (`mode: list_sync_clients`) para retornar o conjunto completo em uma resposta (sem paginação externa).
- Garantir resposta consistente:
  - `clients`: lista completa
  - `total`: total real
  - `has_more: false`
  - sem `next_batch_start` para esse modo
- Incluir log resumido de execução (total clientes, duração, contagem por status) para diagnóstico rápido.

2) Tornar frontend resiliente a versões antigas da função
- Em `handleLoadSyncClients` (`Bitrix24App.tsx`), implementar fallback compatível:
  - Se vier `has_more: true`, continuar paginando até completar (deduplicando por `client_id`).
  - Se vier resposta nova (`has_more: false`), mantém fluxo de chamada única.
- Isso evita quebra mesmo se houver atraso de deploy ou cache de versão.

3) Melhorar UX para não parecer “sem dados”
- Após carregar clientes:
  - Auto-selecionar segmento com dados (se Etapa A = 0 e Etapa B > 0, abrir Etapa B automaticamente).
  - Auto-selecionar status com contagem > 0 (Atrasado/Em Aberto/Quitado).
- Adicionar empty-state explícito quando filtro atual não tem itens:
  - “Há X clientes carregados, mas nenhum neste filtro. Clique em Etapa B / Quitados etc.”

4) Robustez de erro e timeout
- Tratar `res.ok` + payload de erro no frontend.
- Mostrar feedback de erro claro (“Falha ao carregar Fase 3”) com botão de tentativa.
- Preservar `syncClients` anterior se a recarga falhar (evita “sumir tudo” por falha transitória).

Validação (aceite):
- Carregar Fase 3 e confirmar total próximo de 1.019 clientes (não 10).
- Confirmar que a primeira tela já mostra clientes sem precisar trocar manualmente abas.
- Confirmar tempos de carregamento e logs da função sem loops redundantes.
- Teste ponta a ponta: carregar Fase 3 → filtrar por status → sincronizar 1 cliente (existente e novo) com sucesso.

Arquivos a ajustar:
- `supabase/functions/import-access-data/index.ts`
- `src/pages/Bitrix24App.tsx`
