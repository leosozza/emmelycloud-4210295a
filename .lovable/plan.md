

# Plano: Central de Atendimento Omnichannel

## Resumo

Criar a interface completa da Central de Atendimento no estilo omnichannel (similar ao ASCSAC), com tabelas no banco de dados para conversas e mensagens. A integracao real com WhatsApp e Instagram sera preparada na estrutura mas implementada quando as APIs estiverem disponiveis.

---

## 1. Novas Tabelas no Banco de Dados

### Enum `channel_type`
Valores: `whatsapp`, `instagram`, `email`, `webchat`

### Enum `conversation_status`
Valores: `aberta`, `em_atendimento`, `aguardando`, `fechada`

### Enum `message_direction`
Valores: `inbound`, `outbound`

### Tabela `conversations`
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| channel | channel_type | Sim |
| contact_name | text | Sim |
| contact_phone | text | Nao |
| contact_email | text | Nao |
| contact_instagram | text | Nao |
| contact_avatar_url | text | Nao |
| client_id | uuid (FK -> clients) | Nao |
| status | conversation_status (default 'aberta') | Sim |
| assigned_to | text | Nao |
| department | text | Nao |
| last_message_at | timestamptz | Nao |
| last_message_preview | text | Nao |
| unread_count | integer (default 0) | Sim |
| created_at / updated_at | timestamptz | Sim |

### Tabela `messages`
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| conversation_id | uuid (FK -> conversations) | Sim |
| direction | message_direction | Sim |
| content | text | Sim |
| sender_name | text | Nao |
| media_url | text | Nao |
| media_type | text | Nao |
| external_id | text | Nao |
| read_at | timestamptz | Nao |
| created_at | timestamptz | Sim |

### Tabela `quick_replies`
| Coluna | Tipo | Obrigatorio |
|--------|------|-------------|
| id | uuid (PK) | Sim |
| title | text | Sim |
| content | text | Sim |
| category | text | Nao |
| created_at | timestamptz | Sim |

RLS permissivo (`true`) em todas as tabelas, consistente com as tabelas de cadastro.

Realtime habilitado nas tabelas `conversations` e `messages` para atualizacao em tempo real.

---

## 2. Interface da Central de Atendimento

### Layout (3 paineis)

```text
+------------------+------------------------+------------------+
|  Lista de        |   Area de Chat         |  Perfil do       |
|  Conversas       |   (mensagens)          |  Contacto        |
|                  |                        |                  |
|  - Pesquisa      |  - Header conversa     |  - Nome/foto     |
|  - Filtro canal  |  - Mensagens (scroll)  |  - Canal         |
|  - Cards com     |  - Input de resposta   |  - Dados cliente  |
|    preview       |  - Respostas rapidas   |  - Historico     |
|    badge canal   |  - Anexos              |  - Tags          |
+------------------+------------------------+------------------+
```

### Painel Esquerdo - Lista de Conversas
- Campo de pesquisa por nome/telefone
- Filtros por canal (WhatsApp, Instagram, todos)
- Filtro por status (aberta, em atendimento, fechada)
- Cards com: avatar, nome, preview da ultima mensagem, hora, badge do canal (icone/cor), contador de nao lidas

### Painel Central - Chat
- Header com nome do contacto, canal, status e acoes (fechar, transferir)
- Area de mensagens com scroll, baloes diferenciados (enviada/recebida)
- Timestamps agrupados por dia
- Campo de input com botao de enviar, anexar e acesso a respostas rapidas

### Painel Direito - Perfil do Contacto
- Avatar e nome
- Canal de origem com icone
- Telefone, email, Instagram
- Link para ficha do cliente (se vinculado)
- Botao para vincular a um cliente existente
- Tags/departamento

---

## 3. Navegacao

Adicionar "Central de Atendimento" ao sidebar no grupo "Principal" com icone `MessageCircle`, rota `/atendimento`.

---

## 4. Dados Iniciais

Inserir algumas conversas e mensagens de exemplo para demonstrar o layout funcional.

---

## 5. Detalhes Tecnicos

- **Migracao SQL**: enums + 3 tabelas + triggers `updated_at` + realtime
- **Componentes React**:
  - `src/pages/Atendimento.tsx` - pagina principal
  - `src/components/atendimento/ConversationList.tsx` - painel esquerdo
  - `src/components/atendimento/ChatPanel.tsx` - painel central
  - `src/components/atendimento/ContactProfile.tsx` - painel direito
  - `src/components/atendimento/MessageBubble.tsx` - balao de mensagem
  - `src/components/atendimento/QuickReplies.tsx` - respostas rapidas
- **TanStack React Query** para CRUD
- **Supabase Realtime** para receber mensagens novas sem refresh
- Rota `/atendimento` adicionada ao `App.tsx`
- Icones de canal: WhatsApp (verde), Instagram (gradiente rosa/roxo), Email (azul)

