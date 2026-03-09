

## Plano: Botões de Ação Separados + Campos Sempre Visíveis

### Problema
Atualmente cada parcela tem um `<select>` com todas as ações + botão "Executar". O utilizador quer:
1. **Botões separados**: Editar, Gerar Link, Dar Baixa — sempre visíveis como botões individuais
2. **Enviar Fluxo**: ao clicar, abre o seletor de fluxo inline + botão "Enviar"
3. **Campos como vencimento e gateway sempre visíveis** — mesmo quando em branco, devem aparecer como clicáveis para editar diretamente no placement

### Alterações em `supabase/functions/bitrix24-payment-tab/index.ts`

#### 1. Substituir dropdown por botões individuais (linhas 191-211)

Trocar o bloco `<select id="action-...">` + `Executar` por 3-4 botões inline:

```html
<div class="b24-item-actions">
  <button onclick='openEditModal(...)' class="b24-btn-action" title="Editar Parcela">✏ Editar</button>
  <button onclick='generatePaymentLink(...)' class="b24-btn-action" title="Gerar Link">🔗 Link</button>
  <button onclick='openBaixaModal(...)' class="b24-btn-action b24-btn-baixa" title="Dar Baixa">✓ Baixa</button>
  <!-- Se tem fluxos -->
  <button onclick='toggleFlowRow("id")' class="b24-btn-action" title="Enviar Fluxo">📤 Fluxo</button>
</div>
<!-- Flow row permanece escondido até clicar -->
<div id="flow-row-..." style="display:none">...</div>
```

Adicionar CSS `.b24-btn-action` com estilo de botão compacto.

#### 2. Campos sempre visíveis e editáveis (vencimento, gateway, método)

Na secção de metadata de cada parcela (linhas 181-186), quando `due_date` ou `payment_method` ou gateway estiverem em branco, mostrar como link clicável que abre o modal de edição:

```html
<!-- Vencimento: se vazio, mostra link para editar -->
<span onclick='openEditModal(inst)' style="cursor:pointer" class="b24-missing">
  Vencimento: ⚠ Clique para definir
</span>

<!-- Gateway: sempre mostrar, mesmo vazio -->
<span>🏦 Gateway: Stripe PT</span>  <!-- ou "—" se vazio, clicável -->
```

#### 3. Remover a função `executeAction` (linhas 777-795)

Já não será necessária pois cada botão chama a função diretamente.

#### 4. Adicionar `toggleFlowRow` function

```javascript
function toggleFlowRow(instId) {
  var row = document.getElementById('flow-row-' + instId);
  if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
}
```

### CSS novo

```css
.b24-btn-action {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 4px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  color: var(--text-primary);
  transition: all 0.15s;
  white-space: nowrap;
}
.b24-btn-action:hover { background: var(--bg-page); }
.b24-btn-baixa { border-color: #589731; color: #589731; }
.b24-btn-baixa:hover { background: #e0f5d7; }
```

### Ficheiro

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-payment-tab/index.ts` | Botões separados, campos sempre visíveis, toggle fluxo |

