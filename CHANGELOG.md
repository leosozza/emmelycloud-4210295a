# Changelog

## [Unreleased]

### Added

#### Chatbot / IA Training Parity (from thothai)

- **Persona Training via Chat** (`src/components/agentes/AgentTrainingChat.tsx`):
  - New chat component that allows training AI agents with natural language instructions.
  - Supports preview (generates a behavioral rule before applying), confirm (`"confirmar"`), and training history with revert.
  - Accessible via the ✨ button on each agent card in the Agentes IA page.

- **Supabase: `persona_training_history` table** (`supabase/migrations/20260219200000_persona_training_history.sql`):
  - Stores instruction, generated rule, applied_at, and reverted_at for each training applied per agent.
  - RLS policy for authenticated users.

- **Supabase: `persona-trainer` edge function** (`supabase/functions/persona-trainer/index.ts`):
  - Supports `preview`, `train`, and `revert` actions.
  - Uses Lovable AI gateway to generate a concise behavioral rule from a natural language instruction.
  - On `train`, appends the rule to the agent's `system_prompt` and records history.
  - On `revert`, removes the rule block and marks the history entry as reverted.

- **Chatbot Toggle per Channel** (`src/pages/Integracoes.tsx`):
  - New "Chatbot" tab in the Integrations page with per-channel enable/disable toggle.
  - Select which AI agent handles each channel (WhatsApp, Instagram).
  - Persisted in new `chatbot_channel_settings` table.

- **Supabase: `chatbot_channel_settings` table** (`supabase/migrations/20260219200001_chatbot_channel_settings.sql`):
  - Stores chatbot enabled state and active agent ID per channel.
  - Seeds default rows for `whatsapp` and `instagram`.

- **Bitrix24 ExecuteFlow Robot** (`supabase/functions/bitrix24-robot-handler/index.ts`):
  - New `emmely_execute_flow` robot that triggers a flow from a Bitrix24 business process.
  - Accepts `flow_id`, `phone`, and optional `trigger_message` properties.
  - Finds or creates the WhatsApp conversation and calls the `flow-engine` function.

- **Manual Page** (`src/pages/Manual.tsx`):
  - New `/manual` route with a comprehensive guide of all app features.
  - Quick-start buttons, expandable feature cards with tips, and FAQ section.
  - Highlights new chatbot training and chatbot toggle features.
  - Accessible from the sidebar under "Gestão".
