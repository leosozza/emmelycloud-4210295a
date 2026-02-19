-- Migration: chatbot_channel_settings
-- Stores per-channel chatbot enable/disable + active agent selection
-- Note: application logic must check that agent_id is non-null when enabled=true,
-- since agent deletion sets agent_id to null (on delete set null) but leaves enabled as-is.

create table if not exists public.chatbot_channel_settings (
  channel    text primary key,
  enabled    boolean not null default false,
  agent_id   uuid references public.ai_agents(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Seed default rows for known channels
insert into public.chatbot_channel_settings (channel, enabled)
values ('whatsapp', false), ('instagram', false)
on conflict (channel) do nothing;

-- RLS
alter table public.chatbot_channel_settings enable row level security;

create policy "Authenticated users can manage chatbot settings"
  on public.chatbot_channel_settings
  for all
  using (auth.role() = 'authenticated');
