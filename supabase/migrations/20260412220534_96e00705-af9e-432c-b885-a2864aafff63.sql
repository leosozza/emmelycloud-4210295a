
-- Add missing columns to simulations
ALTER TABLE public.simulations 
  ADD COLUMN IF NOT EXISTS current_round integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intervention_prompt text;

-- Create ai_crews table
CREATE TABLE IF NOT EXISTS public.ai_crews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  mission text,
  execution_mode text NOT NULL DEFAULT 'sequential',
  agent_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_crews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access ai_crews" ON public.ai_crews FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read ai_crews" ON public.ai_crews FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_ai_crews_updated_at BEFORE UPDATE ON public.ai_crews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create ai_tasks table
CREATE TABLE IF NOT EXISTS public.ai_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES public.ai_crews(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  expected_input text,
  expected_output text,
  task_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access ai_tasks" ON public.ai_tasks FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read ai_tasks" ON public.ai_tasks FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_ai_tasks_updated_at BEFORE UPDATE ON public.ai_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create ai_task_executions table
CREATE TABLE IF NOT EXISTS public.ai_task_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.ai_tasks(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.ai_crews(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  input_data jsonb DEFAULT '{}',
  output_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  error text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_task_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access ai_task_executions" ON public.ai_task_executions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read ai_task_executions" ON public.ai_task_executions FOR SELECT TO authenticated USING (true);
