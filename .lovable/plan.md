

## Plan: AI Automation Agent

### What already exists
- `ai-triage` edge function already does `classify_lead` with Lovable AI (gemini-3-flash-preview)
- `LeadSheet` already has "Classificar com IA" button using `useAiTriage` hook
- `ContactProfile` has contact info but no "Resumir Conversa" button

### What to build

#### 1. Edge Function: `ai-automation-agent`
Single edge function with `action` parameter routing to 4 handlers:

- **`classify_lead`**: Reuse existing `ai-triage` logic (fetch lead + messages, call AI with tool calling, update lead with ai_score/ai_viability/legal_area/urgency/notes)
- **`summarize_conversation`**: Fetch all messages for conversation_id, send to AI asking for a summary, save summary to the linked lead's notes (or return if no lead linked)
- **`suggest_next_action`**: Fetch lead + case + conversation data, ask AI to suggest next action (ligar, enviar proposta, agendar reunião, etc.), return suggestion
- **`extract_lead_data`**: Fetch conversation messages, ask AI to extract name/phone/email/legal_area using tool calling, create or update lead with extracted data

All actions use `LOVABLE_API_KEY` + `google/gemini-3-flash-preview`. Add to `config.toml` with `verify_jwt = false`.

#### 2. Frontend Hook: `useAiAutomation`
Generic hook wrapping `supabase.functions.invoke("ai-automation-agent", { body: { action, ...params } })` with toast notifications per action type.

#### 3. LeadSheet: Add "Classificar com IA" for all stages
The button already exists in triage stage and as "Reclassificar" outside triage. Will keep existing behavior — no changes needed for leads.

#### 4. ContactProfile: Add "Resumir Conversa" button
Add a new `CollapsibleSection` titled "IA" with:
- "Resumir Conversa" button calling `summarize_conversation` with the conversation ID
- "Extrair Dados" button calling `extract_lead_data`
- Loading states with spinner

#### Technical details

**Edge function structure:**
```
supabase/functions/ai-automation-agent/index.ts
```
- Switch on `action` field from request body
- Each action: fetch context from DB → build prompt → call AI gateway → parse response → update DB → return result
- Tool calling for structured output (classify_lead, extract_lead_data)
- Plain text response for summarize_conversation and suggest_next_action
- Handle 429/402 rate limit errors

**Config update:** Add `[functions.ai-automation-agent]` with `verify_jwt = false` to `supabase/config.toml`.

**Hook file:** `src/hooks/useAiAutomation.ts` with individual mutation functions for each action.

**ContactProfile changes:** Add Sparkles icon button for summarize + extract, with loading state and toast feedback.

