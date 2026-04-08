

# Adicionar Botão "Reparar Campos" na Vista Configurações do Bitrix24

## Problema

A edge function `bitrix24-install?action=repair_fields` existe e funciona, mas **não há nenhum botão na UI** para a acionar. A vista de Configurações no iframe Bitrix24 (`Bitrix24App.tsx`) tem botões para "Re-registar Bot", "Re-registar Webhooks" e "Re-sincronizar Conector", mas falta o "Reparar Campos".

## Solução

### Ficheiro: `src/pages/Bitrix24App.tsx`

Adicionar um novo botão **"Reparar Campos"** na secção de acções da vista Configurações (após o botão "Re-sincronizar Conector", ~linha 1097):

- Novo state: `repairingFields` + `repairFieldsResult`
- Ao clicar, chama `POST ${SUPABASE_URL}/functions/v1/bitrix24-install?action=repair_fields` com o auth do BX24 (mesmo padrão do botão "Re-registar Bot")
- Mostra resultado de sucesso/erro inline (mesmo padrão visual dos outros botões)
- Ícone: `Wrench` do lucide-react
- Label: "Reparar Campos"

Código segue exactamente o mesmo padrão do handler do botão "Re-registar Bot" (linhas 1055-1078), apenas mudando a URL para incluir `?action=repair_fields`.

## Ficheiros a editar

1. **`src/pages/Bitrix24App.tsx`** — adicionar botão "Reparar Campos" + state + handler na vista Configurações

