import { MarkerType } from "@xyflow/react";
import { NODE_TYPE_META, type FlowNodeType, type FlowNodeData } from "@/components/flows/FlowNodeTypes";

// ── Resolve node type dynamically based on PowerBot type + data ──

function inferValidation(name: string): FlowNodeData["aiIntention"] extends undefined ? never : "text" | "phone" | "email" | "cpf" | "city" | "number" {
  const n = name.toLowerCase();
  if (n.includes("email") || n.includes("e-mail") || n.includes("e_mail")) return "email";
  if (n.includes("telefone") || n.includes("phone") || n.includes("whatsapp") || n.includes("celular")) return "phone";
  if (n.includes("cpf")) return "cpf";
  if (n.includes("cidade") || n.includes("city") || n.includes("pais") || n.includes("país") || n.includes("residencia") || n.includes("residência")) return "city";
  return "text";
}

function resolveNodeType(pbType: string, data: any): FlowNodeType {
  switch (pbType) {
    case "initialNode":
    case "messageNode":
      return "message";

    case "conditionalNode": {
      const conditions = data?.conditions || [];
      if (conditions.length > 2) return "switch";
      return "condition";
    }

    case "transferNode":
      return "transfer_to_human";

    case "openAINode": {
      const hasMission = data?.type === "mission" && Array.isArray(data?.missionVariables) && data.missionVariables.length > 0;
      return hasMission ? "ai_intention" : "ai_response";
    }

    case "updateCrmNode": {
      const fields = data?.bitrixCrmFields;
      if (Array.isArray(fields) && fields.length > 0) {
        const entity = fields[0]?.entity;
        if (entity === "deal") return "bitrix_update_deal";
        if (entity === "spa") return "bitrix_update_spa";
        // contact & lead both map to lead
        return "bitrix_update_lead";
      }
      return "bitrix_update_lead";
    }

    case "createCrmNode": {
      const entity = data?.entity;
      if (entity === "deal") return "bitrix_create_deal";
      if (entity === "spa") return "bitrix_create_spa";
      return "bitrix_create_lead";
    }

    default:
      return "set_variable";
  }
}

// ── Extract structured config mapped to FlowNodeData ──

function extractFlowData(pbType: string, nodeType: FlowNodeType, data: any): Partial<FlowNodeData> {
  const result: Partial<FlowNodeData> = { nodeType };

  switch (nodeType) {
    case "ai_intention": {
      const vars = (data.missionVariables || []) as Array<{ name: string; description: string }>;
      result.aiIntention = {
        intentions: vars.map((v) => ({
          fieldName: v.name,
          description: v.description,
          validation: inferValidation(v.name) as any,
          required: true,
        })),
        maxTurns: data.interactionsLimit || 10,
        successMessage: "Obrigado! Coletei todas as informações.",
        failureMessage: "Não consegui coletar as informações necessárias.",
      };
      result.prompt = data.prompt || "";
      result.config = {
        sendAsWhisper: !!data.sendAsWhisper,
        assistantId: data.assistantId || "",
        AIId: data.AIId || "",
      };
      break;
    }

    case "ai_response": {
      result.prompt = data.prompt || "";
      result.config = {
        sendAsWhisper: !!data.sendAsWhisper,
        assistantId: data.assistantId || "",
        AIId: data.AIId || "",
      };
      break;
    }

    case "message": {
      result.message = data.messageData || "";
      result.config = { sendAsWhisper: !!data.sendAsWhisper };
      break;
    }

    case "condition": {
      result.config = { conditions: data.conditions || [] };
      break;
    }

    case "transfer_to_human": {
      result.config = { transferType: data.transferType || "" };
      break;
    }

    case "bitrix_update_lead":
    case "bitrix_update_deal":
    case "bitrix_update_spa": {
      const fields = (data.bitrixCrmFields || []).map((f: any) => ({
        key: f.crmField?.id || f.id || "",
        value: String(f.value ?? ""),
      }));
      const entityMap: Record<string, "lead" | "deal" | "spa"> = {
        bitrix_update_lead: "lead",
        bitrix_update_deal: "deal",
        bitrix_update_spa: "spa",
      };
      result.bitrixCrm = {
        entity: entityMap[nodeType],
        operation: "update",
        entityId: "",
        spaEntityTypeId: "",
        fields,
        resultVar: "",
        pipeline: "",
        stageId: "",
      };
      break;
    }

    case "bitrix_create_lead":
    case "bitrix_create_deal":
    case "bitrix_create_spa": {
      const fields = (data.fields || []).map((f: any) => ({
        key: f.id || "",
        value: String(f.value ?? ""),
      }));
      const entityMap: Record<string, "lead" | "deal" | "spa"> = {
        bitrix_create_lead: "lead",
        bitrix_create_deal: "deal",
        bitrix_create_spa: "spa",
      };
      result.bitrixCrm = {
        entity: entityMap[nodeType],
        operation: "create",
        entityId: "",
        spaEntityTypeId: data.spa ? String(data.spa) : "",
        fields,
        resultVar: "",
        pipeline: data.pipeline ? String(data.pipeline) : "",
        stageId: data.status || "",
      };
      break;
    }

    default: {
      result.config = { ...data };
      break;
    }
  }

  return result;
}

// ── Public interfaces ──

export interface PowerBotImportPreview {
  botName: string;
  nodeCount: number;
  edgeCount: number;
  nodeTypeSummary: Record<string, number>;
}

export interface ImportedFlow {
  name: string;
  nodes: any[];
  edges: any[];
}

// ── Preview ──

export function previewPowerBotFlow(json: any): PowerBotImportPreview | null {
  if (!json?.nodes || !json?.edges) return null;

  const nodeTypeSummary: Record<string, number> = {};
  for (const node of json.nodes) {
    const mapped = resolveNodeType(node.type, node.data || {});
    const label = NODE_TYPE_META[mapped]?.label || mapped;
    nodeTypeSummary[label] = (nodeTypeSummary[label] || 0) + 1;
  }

  return {
    botName: json.botName || "Fluxo Importado",
    nodeCount: json.nodes.length,
    edgeCount: json.edges.length,
    nodeTypeSummary,
  };
}

// ── Convert ──

export function convertPowerBotFlow(json: any): ImportedFlow {
  const name = json.botName || "Fluxo Importado";

  const nodes = json.nodes.map((pbNode: any) => {
    const nodeType = resolveNodeType(pbNode.type, pbNode.data || {});
    const meta = NODE_TYPE_META[nodeType];
    const color = meta?.color || "#666";
    const label = meta?.label || nodeType;
    const flowData = extractFlowData(pbNode.type, nodeType, pbNode.data || {});

    return {
      id: pbNode.id,
      type: "custom",
      position: { x: 0, y: 0 }, // will be set by auto-layout
      data: {
        label: `${label}${pbNode.type === "initialNode" ? " (Início)" : ""}`,
        ...flowData,
        originalType: pbNode.type,
      },
      style: {
        border: `2px solid ${color}`,
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        background: "white",
      },
    };
  });

  const edges = json.edges.map((pbEdge: any) => ({
    id: pbEdge.id,
    source: pbEdge.source,
    target: pbEdge.target,
    sourceHandle: pbEdge.sourceHandle || null,
    targetHandle: pbEdge.targetHandle || null,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  // ── Auto-layout: BFS layered graph ──
  applyAutoLayout(nodes, edges);

  return { name, nodes, edges };
}

// ── Auto-layout algorithm (BFS layers + vertical centering) ──

function applyAutoLayout(nodes: any[], edges: any[]) {
  const H_GAP = 320;
  const V_GAP = 180;

  const nodeIds = new Set(nodes.map((n: any) => n.id));
  const outEdges = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    outEdges.set(id, []);
    inDegree.set(id, 0);
  }

  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      outEdges.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  }

  // BFS from roots (nodes with no incoming edges)
  const layers = new Map<string, number>();
  const queue: string[] = [];

  for (const id of nodeIds) {
    if ((inDegree.get(id) || 0) === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  // If no roots found (cycle), pick first node
  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id);
    layers.set(nodes[0].id, 0);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentLayer = layers.get(current) || 0;
    for (const target of (outEdges.get(current) || [])) {
      const existingLayer = layers.get(target);
      if (existingLayer === undefined) {
        layers.set(target, currentLayer + 1);
        queue.push(target);
      } else if (existingLayer < currentLayer + 1) {
        // Push deeper to avoid backward overlaps
        layers.set(target, currentLayer + 1);
      }
    }
  }

  // Assign any orphan nodes
  for (const id of nodeIds) {
    if (!layers.has(id)) layers.set(id, 0);
  }

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  // Position nodes, vertically centered per layer
  const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
  for (const [layer, ids] of layerGroups) {
    const totalHeight = (ids.length - 1) * V_GAP;
    const startY = -totalHeight / 2;
    ids.forEach((id, idx) => {
      const node = nodeMap.get(id);
      if (node) {
        node.position = { x: layer * H_GAP, y: startY + idx * V_GAP };
      }
    });
  }
}
