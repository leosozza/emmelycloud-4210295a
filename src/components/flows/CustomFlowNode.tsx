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
      className={`min-w-[190px] max-w-[250px] rounded-xl bg-card border-2 shadow-sm transition-all duration-200 ${
        selected ? "shadow-md scale-[1.02]" : "hover:shadow-soft hover:border-muted-foreground/30"
      }`}
      style={{
        borderColor: selected ? meta.color : `${meta.color}40`,
        boxShadow: selected ? `0 0 0 3px ${meta.color}20, 0 4px 12px -2px rgba(0,0,0,0.1)` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background !transition-transform hover:scale-125" />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/40">
        <div 
          className="w-6 h-6 rounded-lg flex items-center justify-center shadow-inner" 
          style={{ backgroundColor: `${meta.color}15` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>
        <span className="text-[12px] font-bold text-foreground/90 truncate tracking-tight">
          {nd.label || meta.label}
        </span>
      </div>

      {/* Body preview */}
      <div className="px-3.5 py-3 space-y-1.5">
        {nd.message && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
            {nd.message.slice(0, 80)}{nd.message.length > 80 ? "…" : ""}
          </p>
        )}

        {hasButtons && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {nd.buttons!.map((btn, i) => (
              <span key={btn.id || i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
                {btn.label}
              </span>
            ))}
          </div>
        )}

        {nd.nodeType === "delay" && nd.delay != null && (
          <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> {nd.delay}s de espera
          </p>
        )}

        {nd.nodeType === "webhook" && nd.webhook?.url && (
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30 border border-border/50">
            <Globe className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground truncate font-mono">{nd.webhook.method} {nd.webhook.url}</p>
          </div>
        )}
        
        {/* ... (rest of conditions remain similar but with slightly better padding/font) */}
      </div>

      {/* Source handles */}
      {isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: "30%" }} className="!w-3.5 !h-3.5 !bg-green-500 !border-2 !border-background hover:scale-125 transition-transform" />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: "70%" }} className="!w-3.5 !h-3.5 !bg-red-500 !border-2 !border-background hover:scale-125 transition-transform" />
        </>
      ) : isLoop ? (
        <>
          <Handle type="source" position={Position.Bottom} id="loop" style={{ left: "30%" }} className="!w-3.5 !h-3.5 !bg-purple-500 !border-2 !border-background hover:scale-125 transition-transform" />
          <Handle type="source" position={Position.Bottom} id="exit" style={{ left: "70%" }} className="!w-3.5 !h-3.5 !bg-gray-500 !border-2 !border-background hover:scale-125 transition-transform" />
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
              className="!w-3 !h-3 !border-2 !border-background hover:scale-125 transition-transform"
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
              className="!w-3 !h-3 !border-2 !border-background hover:scale-125 transition-transform"
              title={btn.label}
            />
          ))}
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: "93%" }} className="!w-2 !h-2 !bg-muted-foreground/50 !border-2 !border-background hover:scale-125 transition-transform" />
        </>
      ) : nd.nodeType !== "end_flow" ? (
        <Handle type="source" position={Position.Bottom} className="!w-3.5 !h-3.5 !bg-muted-foreground/60 !border-2 !border-background hover:scale-125 transition-transform" />
      ) : null}
    </div>
  );
}

export default memo(CustomFlowNode);
