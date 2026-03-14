

## Revisão: Placement Emmely Pay em Contacto

### Resultado da Análise

O código está **correctamente implementado** em ambos os ficheiros:

1. **`bitrix24-install/index.ts`** (linhas 1340-1368): Regista o placement `CRM_CONTACT_DETAIL_TAB` com handler `bitrix24-payment-tab` e título "Emmely Pay"
2. **`bitrix24-payment-tab/index.ts`** (linhas 1488-1627): Detecta `entityTypeId === "3"` (Contacto), busca todos os Deals vinculados, agrega transacções e renderiza via `renderContactPaymentTab`

### Porque não aparece no Bitrix24

O placement foi adicionado ao código **depois** da última instalação do app. O Bitrix24 só regista placements quando a função `bitrix24-install` é chamada. 

### Acção necessária

Basta **reconfigurar** a integração Bitrix24 na página de configurações (o botão que chama `bitrix24-install`). Isto vai registar o novo placement `CRM_CONTACT_DETAIL_TAB` no portal. Não é necessária nenhuma alteração de código.

**Na página Bitrix24App** → secção Configurações → clicar no botão de reconfiguração/reinstalação que chama o endpoint `bitrix24-install`. Após isso, ao abrir qualquer Contacto no CRM do Bitrix24, a aba "Emmely Pay" deverá aparecer.

