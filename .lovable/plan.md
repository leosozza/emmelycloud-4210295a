

# Adicionar Selector de Responsável Padrão na Aba Agenda

## Resumo
Adicionar um campo de seleção de utilizador Bitrix24 como "responsável padrão" na configuração da agenda. Este valor será usado como pré-seleção no calendário do placement.

## Alterações

### `src/components/configuracoes/AgendaTab.tsx`
1. Importar `useBitrixUsers` de `@/hooks/useBitrixUsers`
2. Importar ícone `User` de lucide-react
3. Adicionar campo `default_user_id` ao interface `AgendaConfig` e ao `DEFAULT_CONFIG` (valor: `""`)
4. Adicionar novo Card "Responsável Padrão" antes do card de Reunião Online:
   - Select dropdown com lista de utilizadores Bitrix24 (nome + cargo)
   - Opção "Nenhum (escolher ao agendar)" como default
   - Descrição: "Utilizador pré-selecionado ao abrir o calendário de agendamento"
   - Estado de loading enquanto carrega utilizadores

### `supabase/functions/bitrix24-booking-tab/index.ts`
5. Na action `get_config`, incluir o `default_user_id` na resposta
6. No HTML do calendário, pré-selecionar o utilizador padrão se configurado e disparar `onUserChange()` automaticamente

## Ficheiros a alterar

| Ficheiro | Acção |
|---|---|
| `src/components/configuracoes/AgendaTab.tsx` | Adicionar campo default_user_id com selector de utilizadores Bitrix24 |
| `supabase/functions/bitrix24-booking-tab/index.ts` | Pré-selecionar utilizador padrão no HTML do calendário |

