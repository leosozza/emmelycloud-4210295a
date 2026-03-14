import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

interface FlowMatch {
  flow: any;
  matchType: "keyword" | "button_response" | "input_response" | "all_messages" | "default_flow";
}

// ─── MAIN HANDLER ───
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

    // 1. Get conversation with bot_state
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: jsonHeaders });
    }

    // 2. Check attendance mode - skip if human
    if (conversation.attendance_mode === "human") {
      console.log("[FLOW-ENGINE] Human mode, skipping bot processing");
      return new Response(JSON.stringify({ skipped: "human_mode" }), { headers: jsonHeaders });
    }

    // 3. Anti-loop: Check processing lock (5 second window)
    const lockWindow = 5000; // 5s
    if (conversation.processing_lock_at) {
      const lockAge = Date.now() - new Date(conversation.processing_lock_at).getTime();
      if (lockAge < lockWindow) {
        console.log("[FLOW-ENGINE] Processing lock active, skipping");
        return new Response(JSON.stringify({ skipped: "processing_locked" }), { headers: jsonHeaders });
      }
    }

    // 4. Acquire processing lock
    await supabase
      .from("conversations")
      .update({ 
        processing_lock_at: new Date().toISOString(),
        last_customer_message_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    const botState = (conversation.bot_state || {}) as Record<string, any>;
    let result: any;

    try {
      // 5. Check if we're waiting for a response (button/input)
      if (botState.waiting_for_button && interactive_response) {
        result = await handleButtonResponse(supabase, supabaseUrl, serviceKey, conversation, botState, interactive_response, instance_id);
      } else if (botState.waiting_for_input) {
        result = await handleInputResponse(supabase, supabaseUrl, serviceKey, conversation, botState, message_text, instance_id);
      } else if (botState.force_flow_id) {
        // Resume a specific flow
        const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.force_flow_id).eq("is_active", true).single();
        if (flow) {
          result = await executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, botState, message_text, instance_id);
        } else {
          result = await fallbackToAI(supabaseUrl, serviceKey, conversation, message_text, instance_id);
        }
      } else {
        // 5.5. Evaluate business rules BEFORE flow/AI matching
        const ruleResult = await evaluateBusinessRules(supabase, supabaseUrl, serviceKey, conversation, message_text, instance_id);
        if (ruleResult) {
          console.log("[FLOW-ENGINE] Business rule matched:", ruleResult.rule_name);
          result = ruleResult;
        } else {
          // 6. Try to match a flow
          const match = await matchFlow(supabase, conversation, message_text);
          if (match) {
            console.log("[FLOW-ENGINE] Matched flow:", match.flow.name, "via", match.matchType);
            result = await executeFlow(supabase, supabaseUrl, serviceKey, conversation, match.flow, {}, message_text, instance_id);
          } else {
            // 7. No flow matched - fallback to AI processor
            result = await fallbackToAI(supabaseUrl, serviceKey, conversation, message_text, instance_id);
          }
        }
      }
    } finally {
      // 8. Release processing lock
      await supabase
        .from("conversations")
        .update({ processing_lock_at: null })
        .eq("id", conversation_id);
    }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[FLOW-ENGINE] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── BUSINESS RULES ENGINE ───
async function evaluateBusinessRules(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, messageText: string, instanceId: string | null
): Promise<any | null> {
  const { data: rules } = await supabase
    .from("business_rules")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (!rules || rules.length === 0) return null;

  // Get conversation context for rule evaluation
  const text = (messageText || "").toLowerCase().trim();
  const channel = conversation.channel;
  const contactName = conversation.contact_name || "";

  for (const rule of rules) {
    let fieldValue = "";
    switch (rule.field) {
      case "message_text": fieldValue = text; break;
      case "channel": fieldValue = channel; break;
      case "contact_name": fieldValue = contactName.toLowerCase(); break;
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
    console.log(`[BUSINESS-RULES] Rule "${rule.name}" matched (field=${rule.field}, op=${rule.operator})`);

    switch (rule.action_type) {
      case "auto_reply": {
        const reply = config.reply_text || "Mensagem automática.";
        // Send reply via message-send
        await fetch(`${supabaseUrl}/functions/v1/message-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ conversation_id: conversation.id, content: reply, instance_id: instanceId }),
        });
        return { rule_name: rule.name, action: "auto_reply", reply };
      }
      case "change_agent": {
        if (config.agent_id) {
          const botState = conversation.bot_state || {};
          await supabase.from("conversations").update({
            bot_state: { ...botState, active_sub_agent_id: config.agent_id },
          }).eq("id", conversation.id);
        }
        // Continue to AI with the new agent
        return null;
      }
      case "set_priority": {
        if (config.priority) {
          await supabase.from("conversations").update({
            department: config.department || conversation.department,
          }).eq("id", conversation.id);
        }
        return null;
      }
      case "transfer_human": {
        await supabase.from("conversations").update({
          attendance_mode: "human",
          status: "waiting",
        }).eq("id", conversation.id);
        const msg = config.transfer_message || "Vou transferi-lo para um atendente humano.";
        await fetch(`${supabaseUrl}/functions/v1/message-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ conversation_id: conversation.id, content: msg, instance_id: instanceId }),
        });
        return { rule_name: rule.name, action: "transfer_human", reply: msg };
      }
      default:
        console.log(`[BUSINESS-RULES] Unknown action_type: ${rule.action_type}`);
        return null;
    }
  }

  return null;
}

// ─── FLOW MATCHING ───
async function matchFlow(supabase: any, conversation: any, messageText: string): Promise<FlowMatch | null> {
  const text = (messageText || "").toLowerCase().trim();
  if (!text) return null;

  // Get all active flows, ordered by priority
  const { data: flows } = await supabase
    .from("flows")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (!flows || flows.length === 0) return null;

  // 1. Keyword match (highest priority)
  for (const flow of flows) {
    if (flow.trigger_type === "keyword" && flow.keywords && flow.keywords.length > 0) {
      for (const keyword of flow.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return { flow, matchType: "keyword" };
        }
      }
    }
  }

  // 2. All messages trigger
  for (const flow of flows) {
    if (flow.trigger_type === "all_messages") {
      return { flow, matchType: "all_messages" };
    }
  }

  // 3. Default flow (via agent's default_flow_id)
  const { data: defaultAgent } = await supabase
    .from("ai_agents")
    .select("default_flow_id")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (defaultAgent?.default_flow_id) {
    const defaultFlow = flows.find((f: any) => f.id === defaultAgent.default_flow_id);
    if (defaultFlow) return { flow: defaultFlow, matchType: "default_flow" };
  }

  return null;
}

// ─── FLOW EXECUTION ───
async function executeFlow(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, flow: any, botState: Record<string, any>, messageText: string,
  instanceId?: string | null
): Promise<any> {
  const nodes = (flow.nodes || []) as any[];
  const edges = (flow.edges || []) as any[];
  const variables = { ...((flow.variables || {}) as Record<string, any>), ...(botState.flow_variables || {}) };
  
  // Find start node or resume from current node
  let currentNodeId = botState.current_node_id || findStartNode(nodes, edges);
  if (!currentNodeId) {
    console.log("[FLOW-ENGINE] No start node found in flow:", flow.name);
    return { skipped: "no_start_node" };
  }

  const executedNodes: string[] = [];
  let iterations = 0;
  const maxIterations = 50; // prevent infinite loops

  while (currentNodeId && iterations < maxIterations) {
    iterations++;
    const node = nodes.find((n: any) => n.id === currentNodeId);
    if (!node) break;

    const nodeData = (node.data || {}) as Record<string, any>;
    const nodeType = nodeData.nodeType || node.type;

    console.log("[FLOW-ENGINE] Executing node:", nodeType, node.id);
    executedNodes.push(node.id);

    switch (nodeType) {
      case "message": {
        const text = replaceVariables(nodeData.message || nodeData.content || "", variables);
        await sendMessage(supabaseUrl, serviceKey, conversation.id, text, instanceId);
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "message_buttons": {
        const text = replaceVariables(nodeData.message || "", variables);
        const buttons = (nodeData.buttons || []).slice(0, 3); // WhatsApp max 3 buttons
        await sendInteractiveMessage(supabaseUrl, serviceKey, conversation, "buttons", text, buttons, instanceId);
        // Pause flow - wait for button response
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
        const items = nodeData.items || [];
        await sendInteractiveMessage(supabaseUrl, serviceKey, conversation, "list", text, items, instanceId);
        await updateBotState(supabase, conversation.id, {
          ...botState,
          flow_id: flow.id,
          current_node_id: node.id,
          waiting_for_button: true,
          flow_variables: variables,
        });
        return { paused: "waiting_for_list", node_id: node.id };
      }

      case "input_capture": {
        const prompt = replaceVariables(nodeData.prompt || nodeData.message || "Por favor, informe:", variables);
        await sendMessage(supabaseUrl, serviceKey, conversation.id, prompt, instanceId);
        await updateBotState(supabase, conversation.id, {
          ...botState,
          flow_id: flow.id,
          current_node_id: node.id,
          waiting_for_input: true,
          input_variable: nodeData.variable || "user_input",
          input_validation: nodeData.validation || null,
          flow_variables: variables,
        });
        return { paused: "waiting_for_input", node_id: node.id };
      }

      case "condition": {
        const conditionVar = nodeData.variable || "";
        const conditionOp = nodeData.operator || "equals";
        const conditionVal = nodeData.value || "";
        const varValue = String(variables[conditionVar] || "");

        let conditionMet = false;
        switch (conditionOp) {
          case "equals": conditionMet = varValue === conditionVal; break;
          case "not_equals": conditionMet = varValue !== conditionVal; break;
          case "contains": conditionMet = varValue.includes(conditionVal); break;
          case "not_empty": conditionMet = varValue.length > 0; break;
          case "empty": conditionMet = varValue.length === 0; break;
          case "greater_than": conditionMet = Number(varValue) > Number(conditionVal); break;
          case "less_than": conditionMet = Number(varValue) < Number(conditionVal); break;
        }

        // Find the correct edge based on condition result
        const trueEdge = edges.find((e: any) => e.source === node.id && (e.sourceHandle === "true" || e.label === "Sim"));
        const falseEdge = edges.find((e: any) => e.source === node.id && (e.sourceHandle === "false" || e.label === "Não"));
        currentNodeId = conditionMet ? trueEdge?.target : falseEdge?.target;
        if (!currentNodeId) currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "set_variable": {
        const varName = nodeData.variable || "";
        const varValue = replaceVariables(nodeData.value || "", variables);
        if (varName) variables[varName] = varValue;
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "ai_response": {
        const aiResult = await callAIProcessor(supabaseUrl, serviceKey, conversation, messageText, nodeData);
        if (aiResult?.reply) {
          await sendMessage(supabaseUrl, serviceKey, conversation.id, aiResult.reply, instanceId);
          variables["ai_response"] = aiResult.reply;
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "transfer_to_human": {
        const transferMsg = replaceVariables(nodeData.message || "Transferindo para atendimento humano...", variables);
        await sendMessage(supabaseUrl, serviceKey, conversation.id, transferMsg, instanceId);
        await supabase.from("conversations").update({ attendance_mode: "human" }).eq("id", conversation.id);
        await clearBotState(supabase, conversation.id);
        return { transferred: "human", node_id: node.id };
      }

      case "transfer_to_ai": {
        await supabase.from("conversations").update({ attendance_mode: "bot" }).eq("id", conversation.id);
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "delay": {
        const delayMs = (nodeData.seconds || 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 10000))); // max 10s
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "webhook_call": {
        try {
          const webhookUrl = replaceVariables(nodeData.url || "", variables);
          const webhookMethod = nodeData.method || "POST";
          const res = await fetch(webhookUrl, {
            method: webhookMethod,
            headers: { "Content-Type": "application/json" },
            body: webhookMethod !== "GET" ? JSON.stringify({ conversation, variables, message: messageText }) : undefined,
          });
          const webhookResult = await res.json().catch(() => ({}));
          variables["webhook_response"] = JSON.stringify(webhookResult);
        } catch (e) {
          console.error("[FLOW-ENGINE] Webhook error:", e);
          variables["webhook_response"] = "error";
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      case "end":
        await clearBotState(supabase, conversation.id);
        return { completed: true, executed_nodes: executedNodes };

      case "bitrix_create_badge": {
        try {
          const badge = nodeData.bitrixBadge || {};
          const badgeCode = replaceVariables(badge.badgeCode || "", variables);
          const headerTitle = replaceVariables(badge.headerTitle || "", variables);
          const messagePreview = replaceVariables(badge.messagePreview || "", variables);
          const entityType = badge.entityType || "deal";
          const entityId = replaceVariables(badge.entityId || "", variables);

          const workerRes = await fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
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
          const workerResult = await workerRes.json().catch(() => ({}));
          variables["badge_result"] = JSON.stringify(workerResult);
          console.log("[FLOW-ENGINE] Badge created:", badgeCode, workerResult);
        } catch (e) {
          console.error("[FLOW-ENGINE] Badge error:", e);
          variables["badge_result"] = "error";
        }
        currentNodeId = getNextNode(node.id, edges);
        break;
      }

      default:
        console.log("[FLOW-ENGINE] Unknown node type:", nodeType);
        currentNodeId = getNextNode(node.id, edges);
        break;
    }
  }

  // Flow completed naturally
  await clearBotState(supabase, conversation.id);
  return { completed: true, executed_nodes: executedNodes };
}

// ─── BUTTON/INPUT RESPONSE HANDLERS ───
async function handleButtonResponse(
  supabase: any, supabaseUrl: string, serviceKey: string,
  conversation: any, botState: Record<string, any>, interactiveResponse: any,
  instanceId?: string | null
): Promise<any> {
  const selectedId = interactiveResponse?.button_reply?.id || interactiveResponse?.list_reply?.id || interactiveResponse?.id || "";
  const selectedTitle = interactiveResponse?.button_reply?.title || interactiveResponse?.list_reply?.title || interactiveResponse?.title || "";

  // Store selected value in variables
  const variables = botState.flow_variables || {};
  variables["button_response"] = selectedId;
  variables["button_response_title"] = selectedTitle;

  // Get the flow and continue from the button node
  const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.flow_id).single();
  if (!flow) {
    await clearBotState(supabase, conversation.id);
    return { error: "flow_not_found" };
  }

  const edges = flow.edges || [];
  const currentNodeId = botState.current_node_id;

  // Find the edge matching the selected button
  let nextNodeId = edges.find((e: any) => e.source === currentNodeId && (e.sourceHandle === selectedId || e.label === selectedTitle))?.target;
  if (!nextNodeId) nextNodeId = getNextNode(currentNodeId, edges);

  // Clear waiting state and continue
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
  const variables = botState.flow_variables || {};
  const varName = botState.input_variable || "user_input";
  variables[varName] = inputText;

  // Validate if needed
  const validation = botState.input_validation;
  if (validation) {
    const isValid = validateInput(inputText, validation);
    if (!isValid) {
      const errorMsg = validation.error_message || "Entrada inválida. Por favor, tente novamente.";
      await sendMessage(supabaseUrl, serviceKey, conversation.id, errorMsg, instanceId);
      return { paused: "waiting_for_input_retry" };
    }
  }

  const { data: flow } = await supabase.from("flows").select("*").eq("id", botState.flow_id).single();
  if (!flow) {
    await clearBotState(supabase, conversation.id);
    return { error: "flow_not_found" };
  }

  const nextNodeId = getNextNode(botState.current_node_id, flow.edges || []);
  const newState = { ...botState, waiting_for_input: false, current_node_id: nextNodeId, flow_variables: variables };
  await updateBotState(supabase, conversation.id, newState);

  if (nextNodeId) {
    return executeFlow(supabase, supabaseUrl, serviceKey, conversation, flow, newState, inputText, instanceId);
  }

  await clearBotState(supabase, conversation.id);
  return { completed: true };
}

// ─── HELPERS ───
function findStartNode(nodes: any[], edges: any[]): string | null {
  // Find node with type "start" or "trigger"
  const startNode = nodes.find((n: any) => {
    const type = n.data?.nodeType || n.type;
    return type === "start" || type === "trigger";
  });
  if (startNode) return startNode.id;

  // Find node with no incoming edges
  const targetIds = new Set(edges.map((e: any) => e.target));
  const rootNode = nodes.find((n: any) => !targetIds.has(n.id));
  return rootNode?.id || nodes[0]?.id || null;
}

function getNextNode(currentId: string, edges: any[]): string | null {
  const edge = edges.find((e: any) => e.source === currentId);
  return edge?.target || null;
}

function replaceVariables(text: string, variables: Record<string, any>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, varName) => String(variables[varName] || ""));
}

function validateInput(input: string, validation: any): boolean {
  if (!validation || !validation.type) return true;
  switch (validation.type) {
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
    case "phone": return /^[\d+\s()-]{8,20}$/.test(input);
    case "number": return !isNaN(Number(input));
    case "min_length": return input.length >= (validation.min || 1);
    case "regex": return new RegExp(validation.pattern || "").test(input);
    default: return true;
  }
}

async function updateBotState(supabase: any, conversationId: string, state: Record<string, any>) {
  await supabase.from("conversations").update({ bot_state: state }).eq("id", conversationId);
}

async function clearBotState(supabase: any, conversationId: string) {
  await supabase.from("conversations").update({ bot_state: {} }).eq("id", conversationId);
}

async function sendMessage(supabaseUrl: string, serviceKey: string, conversationId: string, content: string, instanceId?: string | null) {
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({ conversation_id: conversationId, content, skip_db_save: false, instance_id: instanceId || undefined }),
  }).catch(e => console.error("[FLOW-ENGINE] sendMessage error:", e));
}

async function sendInteractiveMessage(
  supabaseUrl: string, serviceKey: string, conversation: any,
  type: "buttons" | "list", text: string, options: any[],
  instanceId?: string | null
) {
  await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({
      conversation_id: conversation.id,
      content: text,
      message_type: type === "buttons" ? "interactive_buttons" : "interactive_list",
      interactive_data: options,
      instance_id: instanceId || undefined,
    }),
  }).catch(e => console.error("[FLOW-ENGINE] sendInteractive error:", e));
}

async function callAIProcessor(supabaseUrl: string, serviceKey: string, conversation: any, messageText: string, nodeData: any): Promise<any> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-process-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        conversation_id: conversation.id,
        message_text: messageText,
        agent_id: nodeData.agent_id || null,
        skip_send: true, // just get the response, don't send it
      }),
    });
    return await res.json();
  } catch (e) {
    console.error("[FLOW-ENGINE] AI processor error:", e);
    return { reply: null };
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
