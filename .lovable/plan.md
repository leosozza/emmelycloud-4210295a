

## Sistema de Assinatura Digital com Validade Jurídica

### Contexto

A API de Sign do Bitrix24 (`sign.b2e.*`) é exclusiva para documentos RH internos (B2E) e **nao serve** para assinatura de contratos com clientes. Vamos construir um sistema proprio integrado ao Bitrix24 via notificacoes/atividades CRM.

O Roadmap ja tem uma entrada para esta feature (progress 0%). Vamos implementar com 3 metodos de autenticacao do signatario.

### Arquitectura

```text
[Contrato pendente] 
    → Gerar link unico /sign/:token
    → Enviar link ao cliente (WhatsApp/Email)
    → Cliente abre pagina publica
    → Escolhe metodo: Desenho na tela | Selfie/Reconhecimento | IP+Aceite
    → Captura de evidencias (IP, user-agent, timestamp, geoloc opcional)
    → Salva em digital_signatures
    → Atualiza contract.status = assinado
    → Notifica Bitrix24 (timeline activity)
    → Gera certificado de prova (PDF)
```

### Alteracoes

#### 1. Migracao DB — Tabela `digital_signatures`

```sql
CREATE TABLE public.digital_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text,
  signer_phone text,
  signer_document text,          -- CPF/NIF do signatario
  signature_method text NOT NULL DEFAULT 'draw',  -- 'draw' | 'selfie' | 'ip_accept'
  signature_image_url text,      -- imagem da assinatura desenhada ou selfie
  ip_address text,
  user_agent text,
  device_info jsonb DEFAULT '{}',
  geolocation jsonb,             -- {lat, lng} opcional
  evidence_hash text,            -- SHA-256 do conjunto de evidencias
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.digital_signatures ENABLE ROW LEVEL SECURITY;

-- Leitura publica (para validacao por token na pagina /sign)
CREATE POLICY "Anyone can read digital_signatures" ON public.digital_signatures FOR SELECT USING (true);
-- Service role insere (edge function)
CREATE POLICY "Service role full access digital_signatures" ON public.digital_signatures FOR ALL USING (true) WITH CHECK (true);
-- Admins full access
CREATE POLICY "Admins full access digital_signatures" ON public.digital_signatures FOR ALL USING (is_admin()) WITH CHECK (is_admin());
```

Adicionar `sign_token` na tabela `contracts`:
```sql
ALTER TABLE public.contracts ADD COLUMN sign_token uuid DEFAULT gen_random_uuid();
ALTER TABLE public.contracts ADD COLUMN signer_name text;
ALTER TABLE public.contracts ADD COLUMN signer_email text;
ALTER TABLE public.contracts ADD COLUMN signer_phone text;
```

#### 2. Edge Function `sign-contract` (nova)

Endpoint publico (`verify_jwt = false`) que:
- **GET** `?token=xxx` — retorna dados do contrato para exibicao (titulo da proposta, valor, datas, nome do signatario)
- **POST** `{ token, method, signature_data, signer_info }` — processa a assinatura:
  - Valida token e contrato pendente
  - Captura IP do request, user-agent
  - Calcula `evidence_hash` = SHA-256(token + ip + timestamp + method + signature_data)
  - Insere em `digital_signatures`
  - Se `signature_image_url` (desenho base64), guarda no storage bucket
  - Atualiza `contracts.status = assinado`, `signed_at = now()`
  - Atualiza caso e lead (mesma logica atual do signMutation)
  - Opcional: notifica Bitrix24 via timeline activity
  - Retorna `{ success, signature_id, evidence_hash }`

#### 3. Pagina publica `/sign/:token` (novo componente)

Pagina React responsiva (mobile-first) com:
- Header com logo e titulo do contrato
- Visualizacao do PDF do contrato (iframe ou link de download)
- Dados do signatario (nome, email, documento)
- 3 tabs de metodo de assinatura:
  - **Desenho** — Canvas HTML5 para assinar com o dedo/mouse, exporta como PNG base64
  - **Selfie** — Acede a camera do dispositivo (`getUserMedia`), captura foto como prova de identidade
  - **Aceite por IP** — Checkbox de concordancia + captura automatica de IP/device
- Botao "Assinar Contrato" que envia ao edge function
- Tela de confirmacao com hash de evidencia e timestamp

#### 4. Integracao na pagina de Contratos

- No `ContratoForm`, adicionar campos `signer_name`, `signer_email`, `signer_phone`
- Na tabela de contratos, adicionar botao "Enviar para Assinatura" que copia o link `/sign/:token`
- Coluna "Assinatura Digital" mostrando se tem assinatura registada e o metodo usado

#### 5. Integracao Bitrix24

- Quando contrato assinado via pagina publica, o edge function pode chamar `bitrix24-send` para registar atividade no CRM (timeline comment no deal/lead associado)

### Ficheiros

| Ficheiro | Tipo | Descricao |
|---|---|---|
| Migracao SQL | Novo | `digital_signatures` + campos em `contracts` |
| `supabase/functions/sign-contract/index.ts` | Novo | GET/POST para validar e processar assinatura |
| `src/pages/SignContract.tsx` | Novo | Pagina publica de assinatura |
| `src/components/contratos/SignatureCanvas.tsx` | Novo | Canvas HTML5 para assinatura desenhada |
| `src/components/contratos/SelfieCapture.tsx` | Novo | Captura de camera para selfie |
| `src/components/contratos/ContratoForm.tsx` | Editar | Adicionar campos do signatario |
| `src/pages/Contratos.tsx` | Editar | Botao "Enviar para Assinatura" + coluna assinatura digital |
| `src/App.tsx` | Editar | Rota `/sign/:token` |
| `supabase/config.toml` | Editar | `verify_jwt = false` para `sign-contract` |

### Notas Tecnicas

- O Canvas usa `CanvasRenderingContext2D` com `touchstart/touchmove/touchend` para mobile
- A selfie usa `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })`
- O hash SHA-256 e calculado via `crypto.subtle.digest` no edge function (Deno)
- Nao usamos a API `sign.b2e` do Bitrix24 porque e exclusiva para documentos RH internos

