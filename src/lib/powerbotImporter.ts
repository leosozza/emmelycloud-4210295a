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

    case "conditionalNode":
      return "condition";

    case "transferNode":
      return "transfer";

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

    case "transfer": {
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
      position: pbNode.position || { x: 0, y: 0 },
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

  return { name, nodes, edges };
}
