

## Proposal Templates System

### What we're building
A proposal templates system that lets users create, manage, and reuse templates when generating new proposals. This adds a "Modelos" (Templates) tab to the Propostas page.

### Database

**New table: `proposal_templates`**
- `id` uuid PK
- `name` text NOT NULL
- `title` text (default proposal title)
- `description` text (service description template)
- `conditions` text (default conditions)
- `value` numeric DEFAULT 0
- `payment_type` payment_type DEFAULT 'fixo'
- `installments` integer DEFAULT 1
- `service_id` uuid nullable (link to services)
- `is_default` boolean DEFAULT false
- `created_at`, `updated_at` timestamps
- RLS: authenticated users full access

### UI Changes

**1. Propostas page (`src/pages/Propostas.tsx`)**
- Add Tabs: "Propostas" (existing table) and "Modelos" (templates)
- Modelos tab shows template cards in a grid with name, value, description preview
- Each template card has Edit, Delete, Duplicate actions
- "Novo Modelo" button to create templates

**2. New component: `PropostaTemplateForm.tsx`**
- Dialog form for creating/editing templates (name, title, description, conditions, value, payment_type, installments, service_id)

**3. Update `PropostaForm.tsx`**
- Add a "Carregar Modelo" (Load Template) select at the top of the form
- When a template is selected, auto-fill title, description, conditions, value, payment_type, installments, service_id

### Files to create/edit
- **Migration**: Create `proposal_templates` table with RLS
- **New**: `src/components/propostas/PropostaTemplateForm.tsx`
- **Edit**: `src/pages/Propostas.tsx` — add Tabs with templates grid
- **Edit**: `src/components/propostas/PropostaForm.tsx` — add template selector dropdown

