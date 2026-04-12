-- ─────────────────────────────────────────────────────────────────────────────
-- Migração: Introdução de Equipes (Crews) e Tarefas Estruturadas (Tasks)
-- Inspirado por CrewAI e MiroFish
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabela de Equipes (Crews)
CREATE TABLE IF NOT EXISTS public.ai_crews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    manager_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    agent_ids uuid[] DEFAULT '{}', -- Lista de agentes especialistas na equipe
    process_mode text DEFAULT 'sequential' CHECK (process_mode IN ('sequential', 'hierarchical', 'consensual', 'simulation')),
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Tabela de Tarefas (Tasks)
CREATE TABLE IF NOT EXISTS public.ai_tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    crew_id uuid REFERENCES public.ai_crews(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL, -- Agente específico (opcional se gerenciado por crew)
    name text NOT NULL,
    description text NOT NULL,
    expected_output text, -- Descrição ou Schema do que se espera
    input_schema jsonb DEFAULT '{}', -- Schema JSON para inputs
    output_schema jsonb DEFAULT '{}', -- Schema JSON para outputs estruturados
    priority integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- 3. Tabela de Execução de Tarefas (Task Executions)
CREATE TABLE IF NOT EXISTS public.ai_task_executions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id uuid REFERENCES public.ai_tasks(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    input_data jsonb DEFAULT '{}',
    output_data jsonb DEFAULT '{}',
    error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 4. Extensão de Memória por Escopo
-- Adicionar suporte para memórias vinculadas a tarefas ou projetos específicos
ALTER TABLE public.user_memory 
    ADD COLUMN IF NOT EXISTS scope_type text DEFAULT 'contact' CHECK (scope_type IN ('contact', 'task', 'project', 'crew')),
    ADD COLUMN IF NOT EXISTS scope_id uuid;

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS ai_crews_name_idx ON public.ai_crews(name);
CREATE INDEX IF NOT EXISTS ai_tasks_crew_id_idx ON public.ai_tasks(crew_id);
CREATE INDEX IF NOT EXISTS ai_task_executions_status_idx ON public.ai_task_executions(status);
CREATE INDEX IF NOT EXISTS user_memory_scope_idx ON public.user_memory(scope_type, scope_id);

-- 6. Habilitar RLS
ALTER TABLE public.ai_crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_executions ENABLE ROW LEVEL SECURITY;

-- 7. Políticas de RLS (Simplificadas para o contexto)
CREATE POLICY "Allow all on ai_crews for authenticated users" ON public.ai_crews
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on ai_tasks for authenticated users" ON public.ai_tasks
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on ai_task_executions for authenticated users" ON public.ai_task_executions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Comentários para documentação
COMMENT ON TABLE public.ai_crews IS 'Agrupamentos de agentes de IA para execução de processos complexos (estilo CrewAI).';
COMMENT ON TABLE public.ai_tasks IS 'Definições de tarefas discretas com inputs e outputs esperados.';
COMMENT ON TABLE public.ai_task_executions IS 'Registros de execuções de tarefas agênticas.';
