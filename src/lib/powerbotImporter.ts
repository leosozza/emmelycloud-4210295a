import { MarkerType } from "@xyflow/react";

const typeMap: Record<string, string> = {
  initialNode: "message",
  messageNode: "message",
  conditionalNode: "condition",
  openAINode: "ai_response",
  transferNode: "transfer",
  updateCrmNode: "set_variable",
  createCrmNode: "webhook",
};

const nodeColors: Record<string, string> = {
  message: "#3b82f6",
  condition: "#f59e0b",
  ai_response: "#8b5cf6",
  delay: "#6b7280",
  transfer: "#10b981",
  webhook: "#ef4444",
  set_variable: "#06b6d4",
};

const nodeLabels: Record<string, string> = {
  message: "Mensagem",
  condition: "Condição",
  ai_response: "Resposta IA",
  transfer: "Transferir",
  webhook: "Webhook",
  set_variable: "Variável",
};

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

function extractConfig(pbType: string, data: any): Record<string, any> {
  switch (pbType) {
    case "messageNode":
      return { messageData: data.messageData, sendAsWhisper: data.sendAsWhisper };
    case "conditionalNode":
      return { conditions: data.conditions };
    case "openAINode":
      return {
        prompt: data.prompt,
        aiType: data.type,
        missionVariables: data.missionVariables,
        sendAsWhisper: data.sendAsWhisper,
        AIId: data.AIId,
        assistantId: data.assistantId,
      };
    case "transferNode":
      return { transferType: data.transferType };
    case "updateCrmNode":
    case "createCrmNode":
      return { fields: data.fields, entity: data.entity, pipeline: data.pipeline };
    default:
      return { ...data };
  }
}

export function previewPowerBotFlow(json: any): PowerBotImportPreview | null {
  if (!json?.nodes || !json?.edges) return null;

  const nodeTypeSummary: Record<string, number> = {};
  for (const node of json.nodes) {
    const mapped = typeMap[node.type] || "set_variable";
    nodeTypeSummary[mapped] = (nodeTypeSummary[mapped] || 0) + 1;
  }

  return {
    botName: json.botName || "Fluxo Importado",
    nodeCount: json.nodes.length,
    edgeCount: json.edges.length,
    nodeTypeSummary,
  };
}

export function convertPowerBotFlow(json: any): ImportedFlow {
  const name = json.botName || "Fluxo Importado";
  const unknownTypes: string[] = [];

  const nodes = json.nodes.map((pbNode: any) => {
    let nodeType = typeMap[pbNode.type];
    if (!nodeType) {
      unknownTypes.push(pbNode.type);
      nodeType = "set_variable";
    }

    const color = nodeColors[nodeType] || "#666";
    const label = nodeLabels[nodeType] || nodeType;

    return {
      id: pbNode.id,
      type: "default",
      position: pbNode.position || { x: 0, y: 0 },
      data: {
        label: `${label}${pbNode.type === "initialNode" ? " (Início)" : ""}`,
        nodeType,
        config: extractConfig(pbNode.type, pbNode.data || {}),
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
