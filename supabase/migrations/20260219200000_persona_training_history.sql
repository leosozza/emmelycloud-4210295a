-- Migration: persona_training_history
-- Persists AI agent training instructions and generated rules

create table if not exists public.persona_training_history (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.ai_agents(id) on delete cascade,
  instruction  text not null,
  generated_rule text not null,
  applied_at   timestamptz not null default now(),
  reverted_at  timestamptz,
  user_id      uuid references auth.users(id) on delete set null
);

-- Index for fast per-agent lookups
create index if not exists persona_training_history_agent_id_idx
  on public.persona_training_history(agent_id);

-- RLS
alter table public.persona_training_history enable row level security;

create policy "Authenticated users can manage training history"
  on public.persona_training_history
  for all
  using (auth.role() = 'authenticated');
