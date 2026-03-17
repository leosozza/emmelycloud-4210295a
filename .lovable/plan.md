
Objetivo: fazer a Fase 3 voltar a listar clientes mesmo quando o Bitrix24 oscila, e impedir o estado “carregou 0” falso.

Diagnóstico
- Os dados locais existem: há 1058 clientes importados com `id_access` e 1019 com cadeia financeira válida para a Fase 3.
- A função `import-access-data` em `mode: "list_sync_clients"` responde com clientes quando chamada diretamente.
- O problema real está no caminho do preview: o request do browser falhou com `Failed to fetch` enquanto a função tentava buscar `crm.contact.list` no Bitrix24 e fazia retries.
- Hoje o frontend faz isto em `src/pages/Bitrix24App.tsx`:
  - em erro retorna `[]`
  - no `finally` faz `setSyncClientsLoaded(true)` sempre
- Resultado: o botão some, a lista fica vazia e parece que “não importou nenhum cliente”, mesmo sem ser verdade.

Plano de implementação

1. Corrigir o estado de erro no frontend
- Arquivo: `src/pages/Bitrix24App.tsx`
- Ajustar `handleLoadSyncClients` para:
  - só marcar `syncClientsLoaded = true` quando houver resposta válida processada
  - manter `syncClientsLoaded = false` em erro de rede / timeout
  - adicionar `syncLoadError` com mensagem amigável
  - não esconder o botão “Carregar Clientes” se a chamada falhar
- Efeito: o usuário verá erro + botão de tentar novamente, em vez de uma tela vazia.

2. Mostrar feedback explícito quando o carregamento falhar
- Arquivo: `src/pages/Bitrix24App.tsx`
- Adicionar um bloco visual na Fase 3 com:
  - mensagem de erro (“Falha ao carregar clientes do Bitrix24”)
  - motivo técnico resumido (“instabilidade de rede / timeout no Bitrix24”)
  - ação clara de retry
- Efeito: fica óbvio que falhou a comunicação, não que “não existem clientes”.

3. Fazer o backend degradar com segurança
- Arquivo: `supabase/functions/import-access-data/index.ts`
- Em `mode === "list_sync_clients"`:
  - manter a montagem da lista local de clientes como prioridade
  - tratar a busca de contactos do Bitrix como enriquecimento opcional, não obrigatório
  - se `crm.contact.list` estiver lento ou instável, devolver a lista mesmo assim, com matching parcial
  - incluir um `warning` no payload quando a correspondência por contactos for ignorada
- Efeito: a Fase 3 continua funcional mesmo se o Bitrix estiver com 502 / timeout.

4. Reduzir o tempo de execução da listagem inicial
- Arquivo: `supabase/functions/import-access-data/index.ts`
- Ajustar o bloco de `crm.contact.list` para usar orçamento de tempo menor e menos retries no modo de listagem.
- Estratégia:
  - usar cache quando existir
  - se não houver cache e o Bitrix falhar, abortar esse enriquecimento cedo
  - não deixar a resposta inteira depender dessa varredura pesada
- Efeito: menos chance de `Failed to fetch` no navegador.

5. Preservar a segmentação da UI sem bloquear a listagem
- Arquivo: `src/pages/Bitrix24App.tsx`
- Se a resposta vier parcial:
  - continuar exibindo os clientes
  - segmentar com base no que foi possível resolver
  - mostrar aviso de “correspondência parcial com Bitrix24”
- Efeito: o utilizador consegue trabalhar e sincronizar, mesmo sem enriquecimento completo.

Resultado esperado
- A Fase 3 volta a mostrar os clientes importados.
- Se o Bitrix oscilar, a tela não fica “zerada”.
- O botão de carregar continua disponível quando houver falha.
- O usuário entende quando houve erro real de rede versus lista realmente vazia.

Detalhes técnicos
- Frontend:
  - remover o `setSyncClientsLoaded(true)` incondicional do `finally`
  - adicionar `syncLoadError` e estado de “partial load”
  - manter `sessionStorage` apenas para sucesso real
- Backend:
  - transformar `crm.contact.list` em passo opcional no `list_sync_clients`
  - responder com `success: true` + `warnings` quando o problema for apenas no enriquecimento do Bitrix
  - priorizar os 1019 clientes locais com financeiro válido

Validação após implementar
1. Chamar a função `list_sync_clients` e confirmar retorno com clientes.
2. Abrir a Fase 3 e verificar que a lista aparece.
3. Simular falha de Bitrix e confirmar:
   - erro visível
   - botão continua disponível
   - a tela não entra em estado falso de “0 clientes”.
