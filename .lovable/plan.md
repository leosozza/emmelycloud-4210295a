

## Sistema de Propostas com Link de Aceite e Fluxo Automatizado

Criar um sistema completo de geração de propostas baseado nos modelos PDF enviados, com link público de aceite pelo cliente, geração de PDF e integração com o fluxo proposta -> contrato -> pagamento.

### 1. Alterações na Base de Dados

Adicionar campos à tabela `proposals` para suportar o link público e dados do modelo:

- `accept_token` (UUID, unique) -- token único para o link público de aceite
- `accepted_at` (timestamptz) -- data/hora do aceite pelo cliente
- `client_name` (text) -- nome do cliente na proposta
- `client_email` (text) -- email para envio
- `client_phone` (text) -- telefone do cliente
- `client_document` (text) -- NIF/CC do cliente
- `client_address` (text) -- morada do cliente
- `service_id` (UUID, nullable) -- serviço associado (puxa budget_details, contract_intro, etc.)
- `description` (text) -- descrição detalhada do serviço/proposta
- `pdf_url` (text) -- URL do PDF gerado e guardado no storage

Criar bucket de storage `proposal-files` (público) para guardar os PDFs gerados.

Criar política RLS para leitura pública por token (sem autenticação) na tabela proposals: permite SELECT quando `accept_token` é fornecido como filtro.

### 2. Copiar os PDFs de Modelo

Copiar os 2 PDFs enviados para `public/templates/` para referência visual. Estes servem como modelo para o layout HTML da proposta.

### 3. Formulário de Proposta Melhorado

Reformular o `PropostaForm` para incluir:
- Dados do cliente (nome, email, telefone, documento, morada) -- com opção de puxar de um cliente existente ou do lead associado ao caso
- Seleção de serviço (puxa automaticamente o valor e detalhes do orçamento)
- Descrição livre do serviço
- Tipo de pagamento, parcelas, valor, condições e validade (campos existentes)
- Ao guardar, gera automaticamente o `accept_token` (UUID)

### 4. Página Pública de Proposta (`/proposta/:token`)

Nova rota pública (fora do AppLayout, sem autenticação) que:
- Carrega a proposta pelo `accept_token`
- Renderiza a proposta no formato dos PDFs modelo (cabeçalho com logo, dados do escritório, dados do cliente, descrição do serviço, valores, condições de pagamento)
- Mostra botão "Aceitar Proposta" (verde, destaque)
- Ao clicar em aceitar: atualiza status para "aceita", regista `accepted_at`, cria contrato automaticamente, atualiza o funil do lead
- Mostra confirmação de aceite com próximos passos

### 5. Geração de PDF

Criar Edge Function `proposal-pdf` que:
- Recebe o `proposal_id`
- Gera HTML da proposta seguindo o modelo dos PDFs enviados (cabeçalho, dados cliente, serviço, valores, condições)
- Converte para PDF (usando HTML renderizado)
- Guarda no bucket `proposal-files`
- Retorna a URL do PDF

### 6. Ações na Listagem de Propostas

Adicionar botões na tabela de propostas:
- **Copiar Link** -- copia o URL público `/proposta/:token` para a clipboard
- **Enviar** -- marca como enviada (fluxo existente)
- **Descarregar PDF** -- chama a edge function e descarrega o PDF
- **Pré-visualizar** -- abre a página pública numa nova aba

### 7. Fluxo Automatizado de Aceite

Quando o cliente aceita a proposta (via link público):
1. Proposta -> status "aceita", `accepted_at` registado
2. Contrato criado automaticamente (vinculado à proposta e ao caso)
3. Lead atualizado para fase "contrato"
4. (Futuro) Parcelas de pagamento geradas automaticamente no financeiro

### Detalhes Técnicos

**Migração SQL:**
```text
ALTER TABLE proposals ADD COLUMN accept_token UUID DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE proposals ADD COLUMN accepted_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN client_name TEXT;
ALTER TABLE proposals ADD COLUMN client_email TEXT;
ALTER TABLE proposals ADD COLUMN client_phone TEXT;
ALTER TABLE proposals ADD COLUMN client_document TEXT;
ALTER TABLE proposals ADD COLUMN client_address TEXT;
ALTER TABLE proposals ADD COLUMN service_id UUID REFERENCES services(id);
ALTER TABLE proposals ADD COLUMN description TEXT;
ALTER TABLE proposals ADD COLUMN pdf_url TEXT;

-- RLS para acesso público por token
CREATE POLICY "Public can read proposal by token"
  ON proposals FOR SELECT
  USING (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('proposal-files', 'proposal-files', true);
```

**Ficheiros a criar:**
- `src/pages/PropostaPublica.tsx` -- página pública de visualização/aceite
- `supabase/functions/proposal-pdf/index.ts` -- edge function para gerar PDF

**Ficheiros a alterar:**
- `src/App.tsx` -- adicionar rota `/proposta/:token`
- `src/pages/Propostas.tsx` -- botões de copiar link, pré-visualizar, descarregar PDF
- `src/components/propostas/PropostaForm.tsx` -- campos de cliente, serviço, descrição
- `src/integrations/supabase/types.ts` -- NÃO editar (auto-gerado)

**Fluxo completo:**
```text
Criar Proposta -> Enviar Link ao Cliente -> Cliente Aceita -> Contrato Criado -> Pagamentos
```

