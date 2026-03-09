import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_TYPE_META, type FlowNodeData, type FlowNodeType } from "./FlowNodeTypes";

function CustomFlowNode({ data, selected }: NodeProps) {
  const nd = data as unknown as FlowNodeData;
  const meta = NODE_TYPE_META[nd.nodeType as FlowNodeType];
  if (!meta) return <div className="p-2 text-xs">Tipo desconhecido</div>;

  const Icon = meta.icon;
  const hasButtons = nd.nodeType === "message_buttons" && nd.buttons && nd.buttons.length > 0;
  const isCondition = nd.nodeType === "condition";
  const isLoop = nd.nodeType === "loop";
  const isRouter = nd.nodeType === "ai_router" && nd.aiRouter;

  return (
    <div
      className="min-w-[180px] max-w-[240px] rounded-lg bg-card border-2 shadow-sm transition-shadow"
      style={{
        borderColor: selected ? meta.color : `${meta.color}80`,
        boxShadow: selected ? `0 0 0 2px ${meta.color}40` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: `${meta.color}20` }}>
          <Icon className="w-3 h-3" style={{ color: meta.color }} />
        </div>
        <span className="text-[11px] font-semibold text-foreground truncate">
          {nd.label || meta.label}
        </span>
      </div>

      {/* Body preview */}
      <div className="px-3 py-2 space-y-1">
        {nd.message && (
          <p className="text-[10px] text-muted-foreground leading-tight line-clamp-3">
            {nd.message.slice(0, 80)}{nd.message.length > 80 ? "…" : ""}
          </p>
        )}

        {hasButtons && (
          <div className="flex flex-wrap gap-1 mt-1">
            {nd.buttons!.map((btn, i) => (
              <span key={btn.id || i} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                {btn.label}
              </span>
            ))}
          </div>
        )}

        {nd.nodeType === "delay" && nd.delay != null && (
          <p className="text-[10px] text-muted-foreground">{nd.delay}s de espera</p>
        )}

        {nd.nodeType === "webhook" && nd.webhook?.url && (
          <p className="text-[10px] text-muted-foreground truncate">{nd.webhook.method} {nd.webhook.url}</p>
        )}

        {nd.nodeType === "ai_response" && nd.prompt && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{nd.prompt.slice(0, 60)}</p>
        )}

        {nd.nodeType === "set_variable" && nd.variable?.name && (
          <p className="text-[10px] text-muted-foreground">{nd.variable.name} = {nd.variable.value}</p>
        )}

        {nd.nodeType === "transfer" && nd.department && (
          <p className="text-[10px] text-muted-foreground">→ {nd.department}</p>
        )}

        {nd.nodeType === "input_capture" && nd.inputCapture?.variableName && (
          <p className="text-[10px] text-muted-foreground">📝 {nd.inputCapture.variableName}</p>
        )}

        {nd.nodeType === "media" && nd.mediaType && (
          <p className="text-[10px] text-muted-foreground">📎 {nd.mediaType}</p>
        )}

        {/* AI Intention preview */}
        {nd.nodeType === "ai_intention" && nd.aiIntention && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">🧠 {nd.aiIntention.intentions.length} campo(s) a coletar</p>
            {nd.aiIntention.intentions.slice(0, 3).map((int, i) => (
              <p key={i} className="text-[9px] text-muted-foreground">• {int.fieldName || "..."} ({int.validation})</p>
            ))}
            {nd.aiIntention.intentions.length > 3 && (
              <p className="text-[9px] text-muted-foreground">+{nd.aiIntention.intentions.length - 3} mais</p>
            )}
            <p className="text-[9px] text-muted-foreground">Máx {nd.aiIntention.maxTurns} turnos</p>
          </div>
        )}

        {/* AI Action preview */}
        {nd.nodeType === "ai_action" && nd.aiAction && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">⚙️ {nd.aiAction.actionType}</p>
            {nd.aiAction.actionDescription && (
              <p className="text-[9px] text-muted-foreground line-clamp-2">{nd.aiAction.actionDescription.slice(0, 60)}</p>
            )}
            {nd.aiAction.resultVar && (
              <p className="text-[9px] text-muted-foreground">→ {`{{${nd.aiAction.resultVar}}}`}</p>
            )}
          </div>
        )}

        {/* AI Router preview */}
        {isRouter && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">🔀 {nd.aiRouter!.routes.length} rota(s)</p>
            {nd.aiRouter!.routes.map((r, i) => (
              <p key={i} className="text-[9px] text-muted-foreground">• {r.label}</p>
            ))}
          </div>
        )}

        {/* Bitrix preview */}
        {nd.nodeType.startsWith("bitrix_") && nd.nodeType !== "bitrix_create_badge" && nd.bitrixCrm && (
          <div className="space-y-0.5">
            {nd.bitrixCrm.entityId && (
              <p className="text-[10px] text-muted-foreground">ID: {nd.bitrixCrm.entityId}</p>
            )}
            {nd.bitrixCrm.fields && nd.bitrixCrm.fields.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{nd.bitrixCrm.fields.length} campo(s)</p>
            )}
            {nd.bitrixCrm.resultVar && (
              <p className="text-[10px] text-muted-foreground">→ {`{{${nd.bitrixCrm.resultVar}}}`}</p>
            )}
          </div>
        )}

        {/* Badge preview */}
        {nd.nodeType === "bitrix_create_badge" && (nd as any).bitrixBadge && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">🏷️ {(nd as any).bitrixBadge.badgeCode || "..."}</p>
            {(nd as any).bitrixBadge.headerTitle && (
              <p className="text-[9px] text-muted-foreground">{(nd as any).bitrixBadge.headerTitle}</p>
            )}
            {(nd as any).bitrixBadge.entityId && (
              <p className="text-[9px] text-muted-foreground">→ {(nd as any).bitrixBadge.entityType} {(nd as any).bitrixBadge.entityId}</p>
            )}
          </div>
        )}
      </div>

      {/* Source handles */}
      {isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: "30%" }} className="!w-3 !h-3 !bg-green-500 !border-2 !border-background" />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: "70%" }} className="!w-3 !h-3 !bg-red-500 !border-2 !border-background" />
        </>
      ) : isLoop ? (
        <>
          <Handle type="source" position={Position.Bottom} id="loop" style={{ left: "30%" }} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-background" />
          <Handle type="source" position={Position.Bottom} id="exit" style={{ left: "70%" }} className="!w-3 !h-3 !bg-gray-500 !border-2 !border-background" />
        </>
      ) : isRouter && nd.aiRouter ? (
        <>
          {nd.aiRouter.routes.map((r, i) => (
            <Handle
              key={r.handleId}
              type="source"
              position={Position.Bottom}
              id={r.handleId}
              style={{ left: `${((i + 1) / (nd.aiRouter!.routes.length + 1)) * 100}%` }}
              className="!w-3 !h-3 !border-2 !border-background"
              title={r.label}
            />
          ))}
        </>
      ) : hasButtons ? (
        <>
          {nd.buttons!.map((btn, i) => (
            <Handle
              key={btn.id || i}
              type="source"
              position={Position.Bottom}
              id={`btn_${btn.id || i}`}
              style={{ left: `${((i + 1) / (nd.buttons!.length + 1)) * 100}%` }}
              className="!w-3 !h-3 !border-2 !border-background"
              title={btn.label}
            />
          ))}
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: "90%" }} className="!w-2 !h-2 !bg-muted-foreground !border-2 !border-background" />
        </>
      ) : nd.nodeType !== "end_flow" ? (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background" />
      ) : null}
    </div>
  );
}

export default memo(CustomFlowNode);
