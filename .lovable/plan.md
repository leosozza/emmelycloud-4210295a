

## Reformular fluxo WhatsApp QR Code nas Instâncias

O utilizador quer que ao criar uma instância "WhatsApp QR Code", o fluxo seja:
1. Criar instância (apenas nome + tipo)
2. Imediatamente após criar, abrir um painel/dialog com QR Code para leitura
3. Sem campos de credenciais visíveis no card da instância (as credenciais do servidor ficam apenas na aba Omni Channel)
4. Sem mencionar "WUZAPI" em lado nenhum da UI

### Alterações em `src/pages/Integracoes.tsx`

**1. Remover referências a "WUZAPI" na UI**
- SelectItem `whatsapp_qrcode`: mudar label de "WhatsApp — QR Code (WUZAPI)" para "WhatsApp — QR Code"
- CardDescription: mudar de "WhatsApp QR Code (WUZAPI)" para "WhatsApp QR Code"
- `WhatsAppQRCodeCard`: mudar titulo de "WhatsApp QRCode" para "WhatsApp QR Code" e remover menções a WUZAPI nos labels

**2. Instância QR Code: após criar, abrir QR dialog automaticamente**
- Adicionar estado `qrDialogInstanceId` no `InstancesTab`
- No `handleCreate`, quando `newType === "whatsapp_qrcode"`, após inserir com sucesso, abrir automaticamente um dialog/sheet de QR Code para essa instância
- O dialog chama `wuzapi-test-connection` com action `connect` e depois mostra o QR code (reutilizando a lógica do `WhatsAppQRCodeCard`)

**3. Card da instância QR Code: sem campos de config, com botão "Ler QR Code"**
- Quando `isWuzapi`, não mostrar campos de configuração (`getConfigFields` retorna `[]`)
- Não mostrar botão "Configurar"
- Em vez disso, mostrar botão "Ler QR Code" que abre o dialog de QR
- Mostrar status de conexão (conectado/desconectado) obtido do backend

**4. QR Code Dialog**
- Novo componente inline `QRCodeDialog` com:
  - Chamada a `wuzapi-test-connection` (connect + status/qr)
  - Exibição do QR code image
  - Botão "Atualizar QR Code"
  - Status de conexão e webhook

### Ficheiros afectados

| Ficheiro | Alteração |
|---|---|
| `src/pages/Integracoes.tsx` | Reformular card QR Code, adicionar QR dialog, remover "WUZAPI" da UI |

