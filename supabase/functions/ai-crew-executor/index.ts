import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { crew_id, task_id, conversation_id, input_data } = await req.json();

    if (!crew_id && !task_id) {
      return new Response(JSON.stringify({ error: "crew_id or task_id required" }), { status: 400, headers: jsonHeaders });
    }

    // 1. Carregar Crew e Tarefas
    const { data: crew } = await supabase
      .from("ai_crews")
      .select("*, manager_agent_id(name, ai_model, ai_provider)")
      .eq("id", crew_id)
      .single();

    if (!crew && crew_id) throw new Error("Crew not found");

    const { data: tasks } = await supabase
      .from("ai_tasks")
      .select("*, agent_id(name, ai_model, ai_provider)")
      .eq("crew_id", crew_id)
      .order("priority", { ascending: false });

    if (!tasks || tasks.length === 0) throw new Error("No tasks found for this crew");

    console.log(`[AI-CREW] Starting execution for crew: ${crew.name} (${crew.process_mode})`);

    const results: any[] = [];
    let currentInput = input_data || {};

    // 2. Execução Baseada no Modo de Processo
    if (crew.process_mode === "sequential") {
      for (const task of tasks) {
        console.log(`[AI-CREW] Executing task: ${task.name}`);
        
        // Criar registro de execução
        const { data: execution } = await supabase
          .from("ai_task_executions")
          .insert({
            task_id: task.id,
            conversation_id,
            input_data: currentInput,
            status: "running",
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        try {
          // Invocar Agente para a Tarefa
          const agentId = task.agent_id?.id || crew.manager_agent_id?.id;
          if (!agentId) throw new Error(`No agent assigned for task ${task.name}`);

          const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              agent_id: agentId,
              message_text: `TAREFA: ${task.description}\nCONTEXTO ATUAL: ${JSON.stringify(currentInput)}\n\nPor favor, execute a tarefa e retorne o resultado final de forma estruturada.`,
              conversation_id,
              skip_send: true,
            }),
          });

          const aiData = await aiResponse.json();
          const taskOutput = aiData.reply || aiData.content || aiData;

          // Atualizar execução com sucesso
          await supabase
            .from("ai_task_executions")
            .update({
              output_data: { result: taskOutput },
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", execution.id);

          results.push({ task: task.name, result: taskOutput });
          currentInput = { ...currentInput, [`last_task_result`]: taskOutput, [`result_${task.name}`]: taskOutput };
        } catch (e: any) {
          console.error(`[AI-CREW] Task ${task.name} failed:`, e);
          await supabase
            .from("ai_task_executions")
            .update({
              status: "failed",
              error: e.message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", execution.id);
          
          if (crew.metadata?.stop_on_error) break;
        }
      }
    } else if (crew.process_mode === "consensual") {
        // Lógica de Consenso: Executa em paralelo e pede para o Manager consolidar
        const promises = tasks.map(async (task) => {
            const agentId = task.agent_id?.id || crew.manager_agent_id?.id;
            const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                body: JSON.stringify({
                  agent_id: agentId,
                  message_text: `ANÁLISE CONSENSUAL: ${task.description}\nCONTEXTO: ${JSON.stringify(currentInput)}`,
                  conversation_id,
                  skip_send: true,
                }),
              });
            return { task: task.name, ...(await aiResponse.json()) };
        });

        const parallelResults = await Promise.all(promises);
        
        // Manager Consolida
        const consolidateRes = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              agent_id: crew.manager_agent_id.id,
              message_text: `CONSOLIDAÇÃO: Verifique os seguintes resultados e gere um consenso final:\n${JSON.stringify(parallelResults)}`,
              conversation_id,
              skip_send: true,
            }),
          });
        
        const finalConsensus = await consolidateRes.json();
        results.push({ type: "consensus", result: finalConsensus.reply || finalConsensus });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      crew: crew.name, 
      results,
      final_output: results[results.length - 1]?.result 
    }), { headers: jsonHeaders });

  } catch (err: any) {
    console.error("[AI-CREW-EXECUTOR] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonHeaders });
  }
});
