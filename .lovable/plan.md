## Objetivo
Colocar o banner "Emmely Fernandes — Advocacia Internacional" (imagem enviada) no topo da fatura pública em `https://emmelycloud.pages.dev/pagamento/:id`, acima do bloco "Fatura de fã / Ailson".

## Alterações

### 1. Registar o banner como Lovable Asset
- Criar `src/assets/emmely-banner.png.asset.json` a partir de `user-uploads://Captura_de_Tela_2026-07-07_às_16.20.35.png` via `lovable-assets create`.
- Mantém o binário fora do repositório e serve pelo CDN.

### 2. `src/pages/PagamentoPublico.tsx`
- Importar o pointer: `import bannerAsset from "@/assets/emmely-banner.png.asset.json";`
- Renderizar o banner como primeira criança do `.payment-detail-panel` (linha ~306), antes do `<div className="payment-section">` que contém "Fatura de serviços / {client_name}":
  ```tsx
  <img
    src={bannerAsset.url}
    alt="Emmely Fernandes — Advocacia Internacional"
    className="payment-header-banner"
  />
  ```
- Estilo inline (dentro do bloco `<style>` já existente na linha 262) para largura total, cantos arredondados no topo e sem margem, além de manter proporção. Ex.:
  ```css
  .payment-header-banner { display:block; width:100%; height:auto; border-radius:12px 12px 0 0; margin:-24px -24px 20px -24px; }
  @media print { .payment-header-banner { border-radius:0; margin:-16px -16px 16px -16px; } }
  ```
  (ajustar aos paddings reais do `.payment-detail-panel` sem alterar outras regras)

### 3. Escopo
- Apenas frontend/apresentação da página pública de pagamento.
- Não mexer no painel lateral esquerdo (logo "E" e nome já existentes) nem em templates de e-mail/PDF.
- Não alterar lógica de pagamento, parcelas, cobrança ou backend.

## Validação
Abrir `https://emmelycloud.pages.dev/pagamento/799e3b72-833b-49b2-8c34-115f6852b7c1` — o banner vinho/rosa com o logo Emmely Fernandes aparece no topo do cartão da fatura, imediatamente acima de "Fatura de … / Ailson".
