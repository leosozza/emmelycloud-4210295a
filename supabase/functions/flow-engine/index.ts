/**
 * flow-engine/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de execução de fluxos do Emmely Cloud.
 *
 * ARQUITETURA:
 *  - Cada nó é executado em sequência dentro de um loop controlado (max 50 iterações)
 *  - Nós que aguardam resposta do usuário (botões, listas, input_capture, ai_intention)
 *    pausam a execução e salvam o estado no bot_state da conversa
 *  - Variáveis de fluxo são propagadas entre nós via o objeto `variables`
 *  - Todas as chamadas ao Bitrix24 passam pelo bitrix24-worker para garantir
 *    o uso correto do token OAuth por workspace
 *
 * NOMES DE TIPOS: devem ser IDÊNTICOS aos valores de FlowNodeType em FlowNodeTypes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ─── Cache de regras de negócio (60s TTL por instância do Edge Function) ──────
let cachedRules: any[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

async function getCachedBusinessRules(supabase: any): Promise<any[]> {
  const now = Date.now();
  if (cachedRules.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) return cachedRules;
  const { data: rules } = await supabase
    .from("business_rules")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });
  cachedRules = rules || [];
  cacheTimestamp = now;
  return cachedRules;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { conversation_id, message_text, message_type, interactive_response, instance_id } = await req.json();
    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: jsonHeaders });
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: jsonHeaders });
    }

    if (conversation.attendance_mode === "human") {
      return new Response(JSON.stringify({ skipped: "human_mode" }), { headers: jsonHeaders });
    }

    // Lock atômico para evitar race condition (janela de 5s)
    const { data: lockResult } = await supabase
      .from("conversations")
      .update({
        processing_lock_at: new Date().toISOString(),
        last_customer_message_at: new Date().toISOString(),
      })
      .eq("id", conversation_id)
      .or(`processing_lock_at.is.null,processing_lock_at.lt.${new Date(Date.now() - 5000).toISOString()}`)
      .select("id");

    if (!lockResult || lockResult.length === 0) {
      return new Response(JSON.stringify({ skipped: "processing_locked" }), { headers: jsonHeaders });
    }

    const botState = (conversation.bot_state || {}) as Record<string, any>;
    let result: any;

    try {
      if (botState.waiting_for_button && interactive_response) {
        result = await handleButtonResponse(supabase, supabaseUrl, serviceKey, conversation, botState, interactive_response, instance_id);
      } else if (botState.waiting_for_input) {
        result = await handleInputResponse(supabase, supabaseUrl, serviceKey, conversation, botState, message_text, instance_id);
      } else if (botState.waiting_for_ai_intention) {
        result = await handleAIIntentionResponse(supabase, supabaseUrl, serviceKey, conversation, botState, message_text, instance_id);
      } else if (botState.waiting_for_reply) {
        // BUG FIX: Resume flow from next node after wait_reply
        result = await handleWaitReplyResponse(supabase, supabaseUrl, serviceKey, conversation, botState, message_text, instance_id);
      } else if (botState.force_flow_id) {
        const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.force_flow_id).eq("is_active", true).single();
        if (flow) {
          result = await executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, botState, message_text, instance_id);
        } else {
          result = await fallbackToAI(supabaseUrl, serviceKey, conversation, message_text, instance_id);
        }
      } else {
        const ruleResult = await evaluateBusinessRules(supabase, supabaseUrl, serviceKey, conversation, message_text, instance_id);
        if (ruleResult) {
          result = ruleResult;
        } else {
          const match = await matchFlow(supabase, conversation, message_text);
          if (match) {
            result = await executeFlow(supabase, supabaseUrl, serviceKey, conversation, match.flow, {}, message_text, instance_id);
          } else {
            result = await fallbackToAI(supabaseUrl, serviceKey, conversation, message_text, instance_id);
          }
        }
      }
    } finally {
      await supabase.from("conversations").update({ processing_lock_at: null }).eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[FLOW-ENGINE] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── REGRAS DE NEGÓCIO ────────────────────────────────────────────────────────

async function evaluateBusinessRules(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, messageText: string, instanceId: string | null
): Promise<any | null> {
  const rules = await getCachedBusinessRules(supabase);
  if (rules.length === 0) return null;

  const text = (messageText || "").toLowerCase().trim();

  for (const rule of rules) {
    let fieldValue = "";
    switch (rule.field) {
      case "message_text": fieldValue = text; break;
      case "channel": fieldValue = conversation.channel; break;
      case "contact_name": fieldValue = (conversation.contact_name || "").toLowerCase(); break;
      case "department": fieldValue = (conversation.department || "").toLowerCase(); break;
      case "attendance_mode": fieldValue = conversation.attendance_mode || "bot"; break;
      default: fieldValue = ""; break;
    }

    let matched = false;
    switch (rule.operator) {
      case "equals": matched = fieldValue === rule.value.toLowerCase(); break;
      case "not_equals": matched = fieldValue !== rule.value.toLowerCase(); break;
      case "contains": matched = fieldValue.includes(rule.value.toLowerCase()); break;
      case "not_contains": matched = !fieldValue.includes(rule.value.toLowerCase()); break;
      case "starts_with": matched = fieldValue.startsWith(rule.value.toLowerCase()); break;
      case "ends_with": matched = fieldValue.endsWith(rule.value.toLowerCase()); break;
      case "exists": matched = fieldValue.length > 0; break;
      case "not_exists": matched = fieldValue.length === 0; break;
      default: matched = false;
    }

    if (!matched) continue;

    const config = rule.action_config || {};
    console.log(`[BUSINESS-RULES] Rule "${rule.name}" matched`);

    switch (rule.action_type) {
      case "auto_reply": {
        const reply = config.reply_text || "Mensagem automática.";
        await sendMessage(supabaseUrl, serviceKey, conversation.id, reply, instanceId);
        return { rule_name: rule.name, action: "auto_reply", reply };
      }
      case "change_agent": {
        if (config.agent_id) {
          const bs = conversation.bot_state || {};
          await supabase.from("conversations").update({
            bot_state: { ...bs, active_sub_agent_id: config.agent_id },
          }).eq("id", conversation.id);
        }
        return null;
      }
      case "transfer_human": {
        await supabase.from("conversations").update({ attendance_mode: "human", status: "waiting" }).eq("id", conversation.id);
        const msg = config.transfer_message || "Vou transferi-lo para um atendente humano.";
        await sendMessage(supabaseUrl, serviceKey, conversation.id, msg, instanceId);
        return { rule_name: rule.name, action: "transfer_human", reply: msg };
      }
      default:
        return null;
    }
  }
  return null;
}

// ─── MATCHING DE FLUXOS ───────────────────────────────────────────────────────

interface FlowMatch { flow: any; matchType: string; }

async function matchFlow(supabase: any, conversation: any, messageText: string): Promise<FlowMatch | null> {
  const text = (messageText || "").toLowerCase().trim();
  if (!text) return null;

  const { data: flows } = await supabase
    .from("flows")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (!flows || flows.length === 0) return null;

  // 1. Keyword match
  for (const flow of flows) {
    if (flow.trigger_type === "keyword" && flow.keywords?.length > 0) {
      for (const keyword of flow.keywords) {
        if (text.includes(keyword.toLowerCase())) return { flow, matchType: "keyword" };
      }
    }
  }

  // 2. All messages
  for (const flow of flows) {
    if (flow.trigger_type === "all_messages") return { flow, matchType: "all_messages" };
  }

  // 3. Default flow via agent
  // BUG FIX: removed .eq("integration_id", ...) — column doesn't exist on ai_agents
  const { data: defaultAgent } = await supabase
    .from("ai_agents")
    .select("default_flow_id")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (defaultAgent?.default_flow_id) {
    const { data: defaultFlow } = await supabase
      .from("flows")
      .select("*")
      .eq("id", defaultAgent.default_flow_id)
      .eq("is_active", true)
      .maybeSingle();
    if (defaultFlow) return { flow: defaultFlow, matchType: "default_flow" };
  }

  return null;
}

// ─── EXECUÇÃO DO FLUXO ────────────────────────────────────────────────────────

async function executeFlow(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, flow: any, botState: Record<string, any>,
  messageText: string, instanceId?: string | null
): Promise<any> {
  const nodes = (flow.nodes || []) as any[];
  const edges = (flow.edges || []) as any[];

  // Variáveis: sistema + fluxo + estado atual
  const variables: Record<string, any> = {
    telefone: conversation.contact_phone || conversation.phone || "",
    nome_contato: conversation.contact_name || "",
    ultima_mensagem: messageText || "",
    conversation_id: conversation.id,
    channel: conversation.channel || "",
    data_hoje: new Date().toLocaleDateString("pt-BR"),
    hora_atual: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    ...(flow.variables || {}),
    ...(botState.flow_variables || {}),
  };

  let currentNodeId = botState.current_node_id || findStartNode(nodes, edges);
  if (!currentNodeId) {
    console.log("[FLOW-ENGINE] No start node found in flow:", flow.name);
    return { skipped: "no_start_node" };
  }

  const executedNodes: string[] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  while (currentNodeId && iterations < MAX_ITERATIONS) {
    iterations++;
    const node = nodes.find((n: any) => n.id === currentNodeId);
    if (!node) {
      console.warn("[FLOW-ENGINE] Node not found:", currentNodeId);
      break;
    }

    const nodeData = (node.data || {}) as Record<string, any>;
    const nodeType: string = nodeData.nodeType || node.type;

    console.log(`[FLOW-ENGINE] Node [${iterations}]: ${nodeType} (${node.id})`);
    executedNodes.push(node.id);

    // ── Execução por tipo ──────────────────────────────────────────────────

    switch (nodeType) {

      // ── MENSAGENS ────────────────────────────────────────────────────────

      case "message": {
        const text = replaceVariables(nodeData.message || nodeData.content || "", variables);
        if (text) await sendMessage(supabaseUrl, serviceKey, conversation.id, text, instanceId);
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "message_buttons": {
        const text = replaceVariables(nodeData.message || "", variables);
        const buttons = (nodeData.buttons || []).slice(0, 3).map((b: any) => ({
          id: b.id || b.label,
          label: replaceVariables(b.label || "", variables),
        }));
        await sendInteractiveMessage(supabaseUrl, serviceKey, conversation, "buttons", text, buttons, instanceId);
        await updateBotState(supabase, conversation.id, {
          ...botState,
          flow_id: flow.id,
          current_node_id: node.id,
          waiting_for_button: true,
          flow_variables: variables,
          button_options: buttons,
        });
        return { paused: "waiting_for_button", node_id: node.id };
      }

      case "message_list": {
        const text = replaceVariables(nodeData.message || "", variables);
        const listTitle = replaceVariables(nodeData.listTitle || "Ver opções", variables);
        const items = (nodeData.listItems || nodeData.items || []).map((item: any) => ({
          id: item.id || item.title,
          title: replaceVariables(item.title || "", variables),
          description: replaceVariables(item.description || "", variables),
        }));
        await sendInteractiveMessage(supabaseUrl, serviceKey, conversation, "list", text, items, instanceId, listTitle);
        await updateBotState(supabase, conversation.id, {
          ...botState,
          flow_id: flow.id,
          current_node_id: node.id,
          waiting_for_button: true,
          flow_variables: variables,
        });
        return { paused: "waiting_for_list", node_id: node.id };
      }

      case "media": {
        const mediaUrl = replaceVariables(nodeData.mediaUrl || nodeData.url || "", variables);
        const caption = replaceVariables(nodeData.mediaCaption || nodeData.caption || "", variables);
        const mediaType = nodeData.mediaType || "image";
        if (mediaUrl) {
          await sendMediaMessage(supabaseUrl, serviceKey, conversation.id, mediaType, mediaUrl, caption, instanceId);
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "location": {
        const lat = replaceVariables(nodeData.locationLat || "", variables);
        const lng = replaceVariables(nodeData.locationLng || "", variables);
        const name = replaceVariables(nodeData.locationName || "", variables);
        if (lat && lng) {
          await sendLocationMessage(supabaseUrl, serviceKey, conversation.id, lat, lng, name, instanceId);
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "vcard": {
        const vcardName = replaceVariables(nodeData.vcardName || "", variables);
        const vcardPhone = replaceVariables(nodeData.vcardPhone || "", variables);
        if (vcardName && vcardPhone) {
          await sendVCardMessage(supabaseUrl, serviceKey, conversation.id, vcardName, vcardPhone, instanceId);
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "sticker": {
        const stickerUrl = replaceVariables(nodeData.stickerUrl || "", variables);
        if (stickerUrl) {
          await sendMediaMessage(supabaseUrl, serviceKey, conversation.id, "sticker", stickerUrl, "", instanceId);
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      // ── LÓGICA ───────────────────────────────────────────────────────────

      case "condition": {
        const cond = nodeData.condition || {};
        const fieldRaw = replaceVariables(cond.field || "", variables);
        const fieldValue = String(variables[cond.field?.replace(/\{\{|\}\}/g, "")] ?? fieldRaw ?? "");
        const condVal = replaceVariables(cond.value || "", variables);

        let met = false;
        switch (cond.operator) {
          case "equals":       met = fieldValue === condVal; break;
          case "not_equals":   met = fieldValue !== condVal; break;
          case "contains":     met = fieldValue.toLowerCase().includes(condVal.toLowerCase()); break;
          case "not_contains": met = !fieldValue.toLowerCase().includes(condVal.toLowerCase()); break;
          case "starts_with":  met = fieldValue.toLowerCase().startsWith(condVal.toLowerCase()); break;
          case "ends_with":    met = fieldValue.toLowerCase().endsWith(condVal.toLowerCase()); break;
          case "greater_than": met = Number(fieldValue) > Number(condVal); break;
          case "less_than":    met = Number(fieldValue) < Number(condVal); break;
          case "exists":       met = fieldValue.length > 0; break;
          case "not_exists":   met = fieldValue.length === 0; break;
          case "regex":        try { met = new RegExp(condVal).test(fieldValue); } catch { met = false; } break;
          default:             met = false;
        }

        const trueEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === "true");
        const falseEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === "false");
        currentNodeId = met ? (trueEdge?.target || null) : (falseEdge?.target || null);
        if (!currentNodeId) currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "switch": {
        const cases = (nodeData.switchCases || []) as any[];
        let matched = false;
        for (const c of cases) {
          const fieldRaw = replaceVariables(c.field || "", variables);
          const fieldValue = String(variables[c.field?.replace(/\{\{|\}\}/g, "")] ?? fieldRaw ?? "");
          const caseVal = replaceVariables(c.value || "", variables);
          let caseMatched = false;
          switch (c.operator) {
            case "equals":       caseMatched = fieldValue === caseVal; break;
            case "not_equals":   caseMatched = fieldValue !== caseVal; break;
            case "contains":     caseMatched = fieldValue.toLowerCase().includes(caseVal.toLowerCase()); break;
            case "not_contains": caseMatched = !fieldValue.toLowerCase().includes(caseVal.toLowerCase()); break;
            case "starts_with":  caseMatched = fieldValue.toLowerCase().startsWith(caseVal.toLowerCase()); break;
            case "ends_with":    caseMatched = fieldValue.toLowerCase().endsWith(caseVal.toLowerCase()); break;
            case "greater_than": caseMatched = Number(fieldValue) > Number(caseVal); break;
            case "less_than":    caseMatched = Number(fieldValue) < Number(caseVal); break;
            case "exists":       caseMatched = fieldValue.length > 0; break;
            case "not_exists":   caseMatched = fieldValue.length === 0; break;
            case "regex":        try { caseMatched = new RegExp(caseVal).test(fieldValue); } catch { caseMatched = false; } break;
          }
          if (caseMatched) {
            const caseEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === c.handleId);
            currentNodeId = caseEdge?.target || null;
            matched = true;
            break;
          }
        }
        if (!matched) {
          const defaultEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === "default");
          currentNodeId = defaultEdge?.target || getNextNode(node.id, edges);
        }
        break;
      }

      case "wait_reply": {
        // Pausa o fluxo e aguarda qualquer mensagem do usuário
        await updateBotState(supabase, conversation.id, {
          ...botState,
          flow_id: flow.id,
          current_node_id: node.id,
          waiting_for_reply: true,
          flow_variables: variables,
        });
        return { paused: "waiting_for_reply", node_id: node.id };
      }

      case "delay": {
        const secs = Math.min(nodeData.delay || nodeData.seconds || 1, 10);
        await new Promise((r) => setTimeout(r, secs * 1000));
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "input_capture": {
        const capture = nodeData.inputCapture || {};
        const question = replaceVariables(capture.question || nodeData.prompt || nodeData.message || "Por favor, informe:", variables);
        await sendMessage(supabaseUrl, serviceKey, conversation.id, question, instanceId);
        await updateBotState(supabase, conversation.id, {
          ...botState,
          flow_id: flow.id,
          current_node_id: node.id,
          waiting_for_input: true,
          input_variable: capture.variableName || nodeData.variable || "user_input",
          input_validation: capture.validation || null,
          input_error_message: capture.errorMessage || "Resposta inválida. Por favor, tente novamente.",
          input_retries: 0,
          input_max_retries: capture.maxRetries || 3,
          flow_variables: variables,
        });
        return { paused: "waiting_for_input", node_id: node.id };
      }

      case "loop": {
        const loopCount = nodeData.loopCount || 3;
        const currentLoop = (botState.loop_counters || {})[node.id] || 0;
        const newCounters = { ...(botState.loop_counters || {}), [node.id]: currentLoop + 1 };

        if (currentLoop < loopCount) {
          // Continuar loop
          const loopEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === "loop");
          currentNodeId = loopEdge?.target || null;
          botState.loop_counters = newCounters;
        } else {
          // Sair do loop
          delete newCounters[node.id];
          botState.loop_counters = newCounters;
          const exitEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === "exit");
          currentNodeId = exitEdge?.target || getNextNode(node.id, edges);
        }
        break;
      }

      // ── INTEGRAÇÕES ──────────────────────────────────────────────────────

      case "webhook_call": {
        const wh = nodeData.webhook || {};
        const url = replaceVariables(wh.url || nodeData.url || "", variables);
        const method = wh.method || nodeData.method || "POST";
        const responseVar = wh.responseVar || nodeData.responseVar || "webhook_result";
        const timeoutMs = Math.min(wh.timeoutMs || 10000, 30000);

        if (url) {
          try {
            const headers: Record<string, string> = { "Content-Type": "application/json", ...(wh.headers || {}) };
            let body: string | undefined;
            if (method !== "GET") {
              if (wh.body) {
                body = replaceVariables(wh.body, variables);
              } else {
                body = JSON.stringify({ conversation_id: conversation.id, variables, message: messageText });
              }
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const res = await fetch(url, { method, headers, body, signal: controller.signal });
              const data = await res.json().catch(() => ({}));
              variables[responseVar] = JSON.stringify(data);
              // Extrair campos de nível superior para variáveis diretas
              if (typeof data === "object" && data !== null) {
                for (const [k, v] of Object.entries(data)) {
                  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
                    variables[`${responseVar}_${k}`] = String(v);
                  }
                }
              }
            } finally {
              clearTimeout(timeout);
            }
          } catch (e) {
            console.error("[FLOW-ENGINE] Webhook error:", e);
            variables[responseVar] = "error";
            if (!wh.onErrorContinue) {
              await clearBotState(supabase, conversation.id);
              return { error: "webhook_failed", node_id: node.id };
            }
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "set_variable": {
        const v = nodeData.variable || {};
        const varName = v.name || nodeData.variableName || "";
        const operation = v.operation || "set";
        const rawValue = replaceVariables(v.value || nodeData.value || "", variables);

        if (varName) {
          switch (operation) {
            case "set":       variables[varName] = rawValue; break;
            case "append":    variables[varName] = String(variables[varName] || "") + rawValue; break;
            case "increment": variables[varName] = (Number(variables[varName]) || 0) + (Number(rawValue) || 1); break;
            case "decrement": variables[varName] = (Number(variables[varName]) || 0) - (Number(rawValue) || 1); break;
            case "clear":     delete variables[varName]; break;
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      // ── IA INTELIGENTE ───────────────────────────────────────────────────

      case "ai_response": {
        const aiResult = await callAIProcessor(supabaseUrl, serviceKey, conversation, messageText, nodeData);
        if (aiResult?.reply) {
          await sendMessage(supabaseUrl, serviceKey, conversation.id, aiResult.reply, instanceId);
          variables["ai_response"] = aiResult.reply;
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "ai_intention": {
        const intention = nodeData.aiIntention || {};
        const fields = intention.intentions || [];
        const maxTurns = intention.maxTurns || 6;
        const currentTurn = (botState.ai_intention_turn || 0);

        if (currentTurn === 0) {
          // Primeira vez: iniciar coleta com a IA
          const collectedSoFar: Record<string, string> = {};
          const aiResult = await callAIIntention(supabaseUrl, serviceKey, conversation, messageText, fields, collectedSoFar, 0);

          if (aiResult.completed) {
            // Todos os campos coletados
            for (const [k, v] of Object.entries(aiResult.collected)) variables[k] = v;
            const successMsg = replaceVariables(intention.successMessage || "Perfeito! Coletei todas as informações.", { ...variables, ...aiResult.collected });
            await sendMessage(supabaseUrl, serviceKey, conversation.id, successMsg, instanceId);
            currentNodeId = getNextNode(node.id, edges);
          } else {
            // Enviar próxima pergunta
            if (aiResult.nextQuestion) {
              await sendMessage(supabaseUrl, serviceKey, conversation.id, aiResult.nextQuestion, instanceId);
            }
            await updateBotState(supabase, conversation.id, {
              ...botState,
              flow_id: flow.id,
              current_node_id: node.id,
              waiting_for_ai_intention: true,
              ai_intention_fields: fields,
              ai_intention_collected: aiResult.collected,
              ai_intention_turn: 1,
              ai_intention_max_turns: maxTurns,
              ai_intention_success_msg: intention.successMessage,
              ai_intention_failure_msg: intention.failureMessage,
              ai_intention_failure_handle: intention.failureHandleId,
              flow_variables: variables,
            });
            return { paused: "waiting_for_ai_intention", node_id: node.id };
          }
        }
        break;
      }

      case "ai_action": {
        const action = nodeData.aiAction || {};
        const resultVar = action.resultVar || "ai_action_result";
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              conversation_id: conversation.id,
              message_text: replaceVariables(action.actionDescription || "", variables),
              action_type: action.actionType,
              tool_config: action.toolConfig || {},
              skip_send: true,
            }),
          });
          const data = await res.json();
          variables[resultVar] = data.reply || data.result || JSON.stringify(data);
        } catch (e) {
          console.error("[FLOW-ENGINE] AI Action error:", e);
          variables[resultVar] = "error";
          if (!action.onErrorContinue) {
            await clearBotState(supabase, conversation.id);
            return { error: "ai_action_failed", node_id: node.id };
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "ai_router": {
        const router = nodeData.aiRouter || {};
        const routes = (router.routes || []) as any[];
        const prompt = replaceVariables(router.analysisPrompt || "Identifique a intenção do cliente.", variables);

        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              conversation_id: conversation.id,
              message_text: messageText,
              router_mode: true,
              router_prompt: prompt,
              router_routes: routes.map((r: any) => ({ id: r.handleId, label: r.label, description: r.description })),
              skip_send: true,
            }),
          });
          const data = await res.json();
          const chosenHandleId = data.chosen_route || router.defaultHandleId;
          const routeEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === chosenHandleId);
          currentNodeId = routeEdge?.target || getNextNode(node.id, edges);
          variables["ai_router_choice"] = chosenHandleId;
        } catch (e) {
          console.error("[FLOW-ENGINE] AI Router error:", e);
          const defaultEdge = edges.find((e: any) => e.source === node.id && e.sourceHandle === router.defaultHandleId);
          currentNodeId = defaultEdge?.target || getNextNode(node.id, edges);
        }
        break;
      }

      case "switch_persona": {
        const personaId = replaceVariables(nodeData.personaId || "", variables);
        if (personaId) {
          await supabase.from("conversations").update({
            bot_state: { ...(conversation.bot_state || {}), active_sub_agent_id: personaId },
          }).eq("id", conversation.id);
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      // ── CONTROLE ─────────────────────────────────────────────────────────

      case "transfer_to_human": {
        const msg = replaceVariables(nodeData.transferMessage || nodeData.message || "Transferindo para atendimento humano...", variables);
        if (msg) await sendMessage(supabaseUrl, serviceKey, conversation.id, msg, instanceId);
        const dept = replaceVariables(nodeData.department || "", variables);
        await supabase.from("conversations").update({
          attendance_mode: "human",
          status: "waiting",
          ...(dept ? { department: dept } : {}),
        }).eq("id", conversation.id);
        await clearBotState(supabase, conversation.id);
        return { transferred: "human", node_id: node.id };
      }

      case "transfer_to_ai": {
        await supabase.from("conversations").update({ attendance_mode: "bot" }).eq("id", conversation.id);
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "end": {
        await clearBotState(supabase, conversation.id);
        return { completed: true, executed_nodes: executedNodes };
      }

      // ── BITRIX24 — CRM ───────────────────────────────────────────────────

      case "bitrix_create_lead":
      case "bitrix_update_lead":
      case "bitrix_get_lead":
      case "bitrix_search_lead":
      case "bitrix_create_deal":
      case "bitrix_update_deal":
      case "bitrix_get_deal":
      case "bitrix_move_deal":
      case "bitrix_create_contact":
      case "bitrix_update_contact":
      case "bitrix_search_contact":
      case "bitrix_create_spa":
      case "bitrix_update_spa":
      case "bitrix_get_spa": {
        const crm = nodeData.bitrixCrm || {};
        const resultVar = crm.resultVar || `${crm.entity || "crm"}_result`;

        // Substituir variáveis nos campos
        const resolvedFields: Record<string, any> = {};
        for (const f of (crm.fields || [])) {
          if (f.key) resolvedFields[f.key] = replaceVariables(f.value || "", variables);
        }

        // Substituir variáveis nos filtros
        const resolvedFilters: Record<string, any> = {};
        for (const f of (crm.filters || [])) {
          if (f.field) resolvedFilters[f.field] = replaceVariables(f.value || "", variables);
        }

        const entityId = replaceVariables(crm.entityId || "", variables);
        const targetPipelineId = replaceVariables(crm.targetPipelineId || "", variables);
        const targetStageId = replaceVariables(crm.targetStageId || "", variables);

        try {
          const workerRes = await fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              _crmRequest: true,
              operation: nodeType,
              entity: crm.entity,
              entityId,
              spaEntityTypeId: crm.spaEntityTypeId,
              fields: resolvedFields,
              filters: resolvedFilters,
              targetPipelineId,
              targetStageId,
              conversation_id: conversation.id,
            }),
          });

          const workerResult = await workerRes.json().catch(() => ({}));
          const resultData = workerResult.result ?? workerResult;

          // Salvar resultado na variável configurada
          variables[resultVar] = typeof resultData === "object" ? JSON.stringify(resultData) : String(resultData);

          // Atalhos convenientes para IDs
          if (nodeType.includes("create") || nodeType.includes("search") || nodeType.includes("get")) {
            const id = workerResult.id || workerResult.result?.ID || workerResult.result?.id;
            if (id) {
              const entityName = crm.entity || "crm";
              variables[`${entityName}_id`] = String(id);
            }
            // Para search: salvar o primeiro resultado
            if (Array.isArray(workerResult.result) && workerResult.result.length > 0) {
              const first = workerResult.result[0];
              variables[`${resultVar}_id`] = String(first.ID || first.id || "");
              variables[`${crm.entity}_id`] = String(first.ID || first.id || "");
            }
          }

          console.log(`[FLOW-ENGINE] ${nodeType} result:`, resultVar, "=", variables[resultVar]);
        } catch (e) {
          console.error(`[FLOW-ENGINE] ${nodeType} error:`, e);
          variables[resultVar] = "error";
          if (!crm.onErrorContinue) {
            await clearBotState(supabase, conversation.id);
            return { error: `${nodeType}_failed`, node_id: node.id };
          }
        }

        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      // ── BITRIX24 — ATIVIDADES E TIMELINE ─────────────────────────────────

      case "bitrix_add_comment": {
        const c = nodeData.bitrixComment || {};
        const entityType = c.entityType || "deal";
        const entityId = replaceVariables(c.entityId || "", variables);
        const comment = replaceVariables(c.comment || "", variables);

        if (entityId && comment) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                _commentRequest: true,
                entityType,
                entityId,
                comment,
                spaEntityTypeId: c.spaEntityTypeId,
                conversation_id: conversation.id,
              }),
            });
          } catch (e) {
            console.error("[FLOW-ENGINE] Add comment error:", e);
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "bitrix_add_activity": {
        const a = nodeData.bitrixActivity || {};
        const entityType = a.entityType || "deal";
        const entityId = replaceVariables(a.entityId || "", variables);
        const subject = replaceVariables(a.subject || "Atividade via bot", variables);
        const description = replaceVariables(a.description || "", variables);
        const deadline = replaceVariables(a.deadline || "", variables);
        const responsibleId = replaceVariables(a.responsibleId || "", variables);

        if (entityId) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                _activityRequest: true,
                entityType,
                entityId,
                subject,
                description,
                deadline,
                responsibleId,
                conversation_id: conversation.id,
              }),
            });
          } catch (e) {
            console.error("[FLOW-ENGINE] Add activity error:", e);
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "bitrix_assign_user": {
        const a = nodeData.bitrixAssign || {};
        const entityType = a.entityType || "deal";
        const entityId = replaceVariables(a.entityId || "", variables);
        const userId = replaceVariables(a.userId || "", variables);

        if (entityId && userId) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                _assignRequest: true,
                entityType,
                entityId,
                userId,
                spaEntityTypeId: a.spaEntityTypeId,
                conversation_id: conversation.id,
              }),
            });
          } catch (e) {
            console.error("[FLOW-ENGINE] Assign user error:", e);
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "bitrix_create_badge": {
        const badge = nodeData.bitrixBadge || {};
        const badgeCode = replaceVariables(badge.badgeCode || "", variables);
        const headerTitle = replaceVariables(badge.headerTitle || "", variables);
        const messagePreview = replaceVariables(badge.messagePreview || "", variables);
        const entityType = badge.entityType || "deal";
        const entityId = replaceVariables(badge.entityId || "", variables);

        if (badgeCode && entityId) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                _badgeRequest: true,
                badgeCode,
                headerTitle,
                messagePreview,
                entityType,
                entityId,
                badgeType: badge.badgeType || "success",
                conversation_id: conversation.id,
              }),
            });
          } catch (e) {
            console.error("[FLOW-ENGINE] Badge error:", e);
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      // ── COMPOSIÇÃO — CALL FLOW ──────────────────────────────────────────
      case "call_flow": {
        const subFlowId = replaceVariables(nodeData.callFlowId || "", variables);
        const passVars = nodeData.callFlowPassVariables !== false;

        if (subFlowId) {
          try {
            const { data: subFlow } = await supabase.from("flows").select("*").eq("id", subFlowId).eq("is_active", true).single();
            if (subFlow) {
              console.log(`[FLOW-ENGINE] call_flow: executing sub-flow "${subFlow.name}"`);
              const subVars = passVars ? { ...variables } : {};
              const subResult = await executeFlow(supabase, supabaseUrl, serviceKey, conversation, subFlow, {}, messageText, instanceId);
              // Merge returned variables back if passVars
              if (passVars && subResult?.variables) {
                Object.assign(variables, subResult.variables);
              }
              console.log(`[FLOW-ENGINE] call_flow: sub-flow completed`, subResult?.completed ? "✓" : "paused");
            } else {
              console.warn(`[FLOW-ENGINE] call_flow: sub-flow not found or inactive: ${subFlowId}`);
            }
          } catch (e) {
            console.error("[FLOW-ENGINE] call_flow error:", e);
          }
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      default:
        console.warn("[FLOW-ENGINE] Unknown node type:", nodeType, "— skipping");
        currentNodeId = getNextNode(node.id, edges);
        break;
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.error("[FLOW-ENGINE] Max iterations reached — possible loop in flow:", flow.name);
  }

  // ── Flow Execution Logging ──────────────────────────────────────────────
  try {
    await supabase.from("flow_execution_logs").insert({
      flow_id: flow.id,
      conversation_id: conversation.id,
      trigger_type: botState.trigger_type || "runtime",
      completed_at: new Date().toISOString(),
      status: iterations >= MAX_ITERATIONS ? "failed" : "completed",
      node_results: executedNodes.map(nid => ({ node_id: nid })),
      variables,
      error: iterations >= MAX_ITERATIONS ? "max_iterations_exceeded" : null,
    });
  } catch (logErr) {
    console.error("[FLOW-ENGINE] Failed to log execution:", logErr);
  }

  await clearBotState(supabase, conversation.id);
  return { completed: true, executed_nodes: executedNodes, variables };
}

// ─── HANDLERS DE RESPOSTA DO USUÁRIO ─────────────────────────────────────────

async function handleButtonResponse(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, botState: Record<string, any>, interactiveResponse: any,
  instanceId?: string | null
): Promise<any> {
  const selectedId = interactiveResponse?.button_reply?.id || interactiveResponse?.list_reply?.id || interactiveResponse?.id || "";
  const selectedTitle = interactiveResponse?.button_reply?.title || interactiveResponse?.list_reply?.title || interactiveResponse?.title || "";

  const variables = { ...(botState.flow_variables || {}) };
  variables["button_response"] = selectedId;
  variables["button_response_title"] = selectedTitle;

  const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.flow_id).single();
  if (!flow) { await clearBotState(supabase, conversation.id); return { error: "flow_not_found" }; }

  const edges = flow.edges || [];
  const currentNodeId = botState.current_node_id;

  // Procurar edge pelo handle do botão (id do botão) ou pelo título
  let nextNodeId = edges.find((e: any) =>
    e.source === currentNodeId && (
      e.sourceHandle === `btn_${selectedId}` ||
      e.sourceHandle === selectedId ||
      e.sourceHandle === `item_${selectedId}` ||
      e.label === selectedTitle
    )
  )?.target;

  // Fallback: handle "default" (sem resposta / timeout)
  if (!nextNodeId) {
    nextNodeId = edges.find((e: any) => e.source === currentNodeId && e.sourceHandle === "default")?.target;
  }
  if (!nextNodeId) nextNodeId = getNextNode(currentNodeId, edges);

  const newState = { ...botState, waiting_for_button: false, current_node_id: nextNodeId, flow_variables: variables };
  await updateBotState(supabase, conversation.id, newState);

  if (nextNodeId) {
    return executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, newState, selectedTitle, instanceId);
  }
  await clearBotState(supabase, conversation.id);
  return { completed: true };
}

async function handleInputResponse(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, botState: Record<string, any>, inputText: string,
  instanceId?: string | null
): Promise<any> {
  const variables = { ...(botState.flow_variables || {}) };
  const varName = botState.input_variable || "user_input";
  const validation = botState.input_validation;
  const retries = botState.input_retries || 0;
  const maxRetries = botState.input_max_retries || 3;

  // Validar entrada
  if (validation && !validateInput(inputText, validation)) {
    if (retries >= maxRetries - 1) {
      // Esgotou tentativas — avançar mesmo assim ou encerrar
      const errorMsg = botState.input_error_message || "Não consegui validar sua resposta. Continuando...";
      await sendMessage(supabaseUrl, serviceKey, conversation.id, errorMsg, instanceId);
    } else {
      const errorMsg = botState.input_error_message || "Resposta inválida. Por favor, tente novamente.";
      await sendMessage(supabaseUrl, serviceKey, conversation.id, errorMsg, instanceId);
      await updateBotState(supabase, conversation.id, { ...botState, input_retries: retries + 1 });
      return { paused: "waiting_for_input_retry" };
    }
  }

  variables[varName] = inputText;

  const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.flow_id).single();
  if (!flow) { await clearBotState(supabase, conversation.id); return { error: "flow_not_found" }; }

  const nextNodeId = getNextNode(botState.current_node_id, flow.edges || []);
  const newState = { ...botState, waiting_for_input: false, current_node_id: nextNodeId, flow_variables: variables };
  await updateBotState(supabase, conversation.id, newState);

  if (nextNodeId) {
    return executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, newState, inputText, instanceId);
  }
  await clearBotState(supabase, conversation.id);
  return { completed: true };
}

// ─── WAIT REPLY HANDLER ────────────────────────────────────────────────────────

async function handleWaitReplyResponse(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, botState: Record<string, any>, inputText: string,
  instanceId?: string | null
): Promise<any> {
  const flowId = botState.flow_id;
  const currentNodeId = botState.current_node_id;

  if (!flowId || !currentNodeId) {
    await clearBotState(supabase, conversation.id);
    return { error: "wait_reply: missing flow_id or current_node_id" };
  }

  const { data: flow } = await supabase.from("flows").select("*").eq("id", flowId).single();
  if (!flow) {
    await clearBotState(supabase, conversation.id);
    return { error: "wait_reply: flow not found" };
  }

  const edges = (flow.edges || []) as any[];
  const nextNodeId = edges.find((e: any) => e.source === currentNodeId)?.target || null;

  // Save user reply in variables
  const variables = { ...(botState.flow_variables || {}), ultima_mensagem: inputText || "" };

  const newState: Record<string, any> = {
    flow_id: flowId,
    current_node_id: nextNodeId,
    flow_variables: variables,
  };

  if (nextNodeId) {
    return executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, newState, inputText, instanceId);
  }
  await clearBotState(supabase, conversation.id);
  return { completed: true };
}


async function handleAIIntentionResponse(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, botState: Record<string, any>, inputText: string,
  instanceId?: string | null
): Promise<any> {
  const variables = { ...(botState.flow_variables || {}) };
  const fields = botState.ai_intention_fields || [];
  const collected = { ...(botState.ai_intention_collected || {}) };
  const turn = botState.ai_intention_turn || 1;
  const maxTurns = botState.ai_intention_max_turns || 6;

  // Chamar IA para extrair campos da resposta do usuário
  const aiResult = await callAIIntention(supabaseUrl, serviceKey, conversation, inputText, fields, collected, turn);

  if (aiResult.completed) {
    // Todos os campos coletados
    for (const [k, v] of Object.entries(aiResult.collected)) variables[k] = v;
    const successMsg = replaceVariables(botState.ai_intention_success_msg || "Perfeito!", variables);
    await sendMessage(supabaseUrl, serviceKey, conversation.id, successMsg, instanceId);

    const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.flow_id).single();
    if (!flow) { await clearBotState(supabase, conversation.id); return { error: "flow_not_found" }; }

    const nextNodeId = getNextNode(botState.current_node_id, flow.edges || []);
    const newState = { ...botState, waiting_for_ai_intention: false, current_node_id: nextNodeId, flow_variables: variables };
    await updateBotState(supabase, conversation.id, newState);

    if (nextNodeId) {
      return executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, newState, inputText, instanceId);
    }
    await clearBotState(supabase, conversation.id);
    return { completed: true };
  }

  if (turn >= maxTurns) {
    // Esgotou turnos — rota de falha
    const failureMsg = replaceVariables(botState.ai_intention_failure_msg || "Não consegui coletar as informações.", variables);
    await sendMessage(supabaseUrl, serviceKey, conversation.id, failureMsg, instanceId);

    const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.flow_id).single();
    if (flow) {
      const failureHandleId = botState.ai_intention_failure_handle;
      const failureEdge = failureHandleId
        ? flow.edges.find((e: any) => e.source === botState.current_node_id && e.sourceHandle === failureHandleId)
        : null;
      const nextNodeId = failureEdge?.target || getNextNode(botState.current_node_id, flow.edges || []);
      if (nextNodeId) {
        const newState = { ...botState, waiting_for_ai_intention: false, current_node_id: nextNodeId, flow_variables: variables };
        await updateBotState(supabase, conversation.id, newState);
        return executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, newState, inputText, instanceId);
      }
    }
    await clearBotState(supabase, conversation.id);
    return { completed: true, reason: "ai_intention_max_turns" };
  }

  // Enviar próxima pergunta
  if (aiResult.nextQuestion) {
    await sendMessage(supabaseUrl, serviceKey, conversation.id, aiResult.nextQuestion, instanceId);
  }

  await updateBotState(supabase, conversation.id, {
    ...botState,
    ai_intention_collected: aiResult.collected,
    ai_intention_turn: turn + 1,
    flow_variables: variables,
  });

  return { paused: "waiting_for_ai_intention", turn: turn + 1 };
}

// ─── FUNÇÕES AUXILIARES ───────────────────────────────────────────────────────

function findStartNode(nodes: any[], edges: any[]): string | null {
  const startNode = nodes.find((n: any) => {
    const type = n.data?.nodeType || n.type;
    return type === "start" || type === "trigger";
  });
  if (startNode) return startNode.id;
  const targetIds = new Set(edges.map((e: any) => e.target));
  const rootNode = nodes.find((n: any) => !targetIds.has(n.id));
  return rootNode?.id || nodes[0]?.id || null;
}

function getNextNode(currentId: string, edges: any[]): string | null {
  // Pega a primeira edge sem sourceHandle específico (handle padrão)
  const edge = edges.find((e: any) => e.source === currentId && !e.sourceHandle);
  if (edge) return edge.target;
  // Fallback: qualquer edge saindo deste nó
  const anyEdge = edges.find((e: any) => e.source === currentId);
  return anyEdge?.target || null;
}

function replaceVariables(text: string, variables: Record<string, any>): string {
  if (!text) return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
    const val = variables[varName.trim()];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

function validateInput(input: string, validation: string): boolean {
  if (!validation || validation === "any") return true;
  const trimmed = input.trim();
  switch (validation) {
    case "text":   return trimmed.length >= 2;
    case "email":  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    case "phone":  return /^[\d+\s()\-]{8,20}$/.test(trimmed.replace(/\s/g, ""));
    case "number": return !isNaN(Number(trimmed)) && trimmed.length > 0;
    case "cpf":    return /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(trimmed);
    case "date":   return /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed);
    default:       return true;
  }
}

async function updateBotState(supabase: any, conversationId: string, state: Record<string, any>) {
  await supabase.from("conversations").update({ bot_state: state }).eq("id", conversationId);
}

async function clearBotState(supabase: any, conversationId: string) {
  await supabase.from("conversations").update({ bot_state: {} }).eq("id", conversationId);
}

async function sendMessage(supabaseUrl: string, serviceKey: string, conversationId: string, content: string, instanceId?: string | null) {
  if (!content) return;
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({ conversation_id: conversationId, content, skip_db_save: false, instance_id: instanceId || undefined }),
  }).catch((e) => console.error("[FLOW-ENGINE] sendMessage error:", e));
}

async function sendInteractiveMessage(
  supabaseUrl: string, serviceKey: string, conversation: any,
  type: "buttons" | "list", text: string, options: any[],
  instanceId?: string | null, listTitle?: string
) {
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({
      conversation_id: conversation.id,
      content: text,
      message_type: type === "buttons" ? "interactive_buttons" : "interactive_list",
      interactive_data: options,
      list_title: listTitle,
      instance_id: instanceId || undefined,
    }),
  }).catch((e) => console.error("[FLOW-ENGINE] sendInteractive error:", e));
}

async function sendMediaMessage(
  supabaseUrl: string, serviceKey: string, conversationId: string,
  mediaType: string, url: string, caption: string, instanceId?: string | null
) {
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({
      conversation_id: conversationId,
      content: caption || url,
      message_type: mediaType,
      media_url: url,
      media_caption: caption,
      instance_id: instanceId || undefined,
    }),
  }).catch((e) => console.error("[FLOW-ENGINE] sendMedia error:", e));
}

async function sendLocationMessage(
  supabaseUrl: string, serviceKey: string, conversationId: string,
  lat: string, lng: string, name: string, instanceId?: string | null
) {
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({
      conversation_id: conversationId,
      message_type: "location",
      location: { lat: parseFloat(lat), lng: parseFloat(lng), name },
      instance_id: instanceId || undefined,
    }),
  }).catch((e) => console.error("[FLOW-ENGINE] sendLocation error:", e));
}

async function sendVCardMessage(
  supabaseUrl: string, serviceKey: string, conversationId: string,
  name: string, phone: string, instanceId?: string | null
) {
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({
      conversation_id: conversationId,
      message_type: "vcard",
      vcard: { name, phone },
      instance_id: instanceId || undefined,
    }),
  }).catch((e) => console.error("[FLOW-ENGINE] sendVCard error:", e));
}

async function callAIProcessor(supabaseUrl: string, serviceKey: string, conversation: any, messageText: string, nodeData: any): Promise<any> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        conversation_id: conversation.id,
        message_text: messageText,
        agent_id: nodeData.personaId || nodeData.agent_id || null,
        extra_prompt: nodeData.prompt || null,
        skip_send: true,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error("[FLOW-ENGINE] AI processor error:", e);
    return { reply: null };
  }
}

async function callAIIntention(
  supabaseUrl: string, serviceKey: string, conversation: any,
  userMessage: string, fields: any[], collected: Record<string, string>, turn: number
): Promise<{ completed: boolean; collected: Record<string, string>; nextQuestion?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        conversation_id: conversation.id,
        message_text: userMessage,
        intention_mode: true,
        intention_fields: fields,
        intention_collected: collected,
        intention_turn: turn,
        skip_send: true,
      }),
    });
    const data = await res.json();
    return {
      completed: data.intention_completed || false,
      collected: data.intention_collected || collected,
      nextQuestion: data.next_question || undefined,
    };
  } catch (e) {
    console.error("[FLOW-ENGINE] AI intention error:", e);
    return { completed: false, collected, nextQuestion: undefined };
  }
}

async function fallbackToAI(supabaseUrl: string, serviceKey: string, conversation: any, messageText: string, instanceId?: string | null): Promise<any> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        conversation_id: conversation.id,
        message_text: messageText,
        instance_id: instanceId || undefined,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error("[FLOW-ENGINE] AI fallback error:", e);
    return { error: "ai_fallback_failed" };
  }
}
