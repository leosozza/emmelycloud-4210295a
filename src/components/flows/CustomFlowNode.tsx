/**
 * CustomFlowNode.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente de renderização visual de cada nó no canvas do construtor de fluxos.
 * Suporta todos os tipos definidos em FlowNodeTypes.ts com handles de saída corretos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, Globe } from "lucide-react";
import { NODE_TYPE_META, type FlowNodeData, type FlowNodeType } from "./FlowNodeTypes";

// ─── Constantes de estilo dos handles ────────────────────────────────────────
const HANDLE_BASE = "!w-3.5 !h-3.5 !border-2 !border-background hover:scale-125 transition-transform";
const HANDLE_DEFAULT = `${HANDLE_BASE} !bg-muted-foreground/60`;
const HANDLE_TRUE = `${HANDLE_BASE} !bg-green-500`;
const HANDLE_FALSE = `${HANDLE_BASE} !bg-red-500`;
const HANDLE_LOOP = `${HANDLE_BASE} !bg-purple-500`;
const HANDLE_EXIT = `${HANDLE_BASE} !bg-gray-500`;
const HANDLE_FAILURE = `${HANDLE_BASE} !bg-red-400`;

// ─── Componente principal ─────────────────────────────────────────────────────

function CustomFlowNode({ data, selected }: NodeProps) {
  const nd = data as unknown as FlowNodeData;
  const meta = NODE_TYPE_META[nd.nodeType as FlowNodeType];

  if (!meta) {
    return (
      <div className="p-2 text-xs bg-destructive/10 border border-destructive rounded-lg min-w-[160px]">
        ⚠️ Tipo desconhecido: {nd.nodeType}
      </div>
    );
  }

  const Icon = meta.icon;
  const isCondition = nd.nodeType === "condition";
  const isSwitch = nd.nodeType === "switch";
  const isLoop = nd.nodeType === "loop";
  const isRouter = nd.nodeType === "ai_router" && nd.aiRouter;
  const isIntention = nd.nodeType === "ai_intention";
  const hasButtons = nd.nodeType === "message_buttons" && nd.buttons && nd.buttons.length > 0;
  const hasList = nd.nodeType === "message_list" && nd.listItems && nd.listItems.length > 0;
  const isEnd = nd.nodeType === "end";

  return (
    <div
      className={`min-w-[190px] max-w-[250px] rounded-xl bg-card border-2 shadow-sm transition-all duration-200 ${
        selected ? "shadow-md scale-[1.02]" : "hover:shadow-soft hover:border-muted-foreground/30"
      } ${nd.error ? "border-destructive animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]" : ""}`}
      style={{
        borderColor: nd.error ? undefined : (selected ? meta.color : `${meta.color}40`),
        boxShadow: selected && !nd.error ? `0 0 0 3px ${meta.color}20, 0 4px 12px -2px rgba(0,0,0,0.1)` : undefined,
      }}
    >
      {/* Handle de entrada (topo) */}
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background !transition-transform hover:scale-125" 
      />

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/40">
        <div 
          className="w-6 h-6 rounded-lg flex items-center justify-center shadow-inner shrink-0" 
          style={{ backgroundColor: nd.error ? "rgba(239,68,68,0.1)" : `${meta.color}15` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: nd.error ? "#ef4444" : meta.color }} />
        </div>
        <span className={`text-[12px] font-bold truncate tracking-tight flex-1 ${nd.error ? "text-destructive" : "text-foreground/90"}`}>
          {nd.label || meta.label}
        </span>
      </div>

      {/* ── Corpo / Preview ───────────────────────────────────────────────── */}
      <div className="px-3.5 py-3 space-y-1.5">
        {/* Mensagem de texto */}
        {nd.message && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
            {nd.message.slice(0, 90)}{nd.message.length > 90 ? "…" : ""}
          </p>
        )}

        {/* Botões */}
        {hasButtons && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {nd.buttons!.map((btn, i) => (
              <span 
                key={btn.id || i} 
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20"
              >
                {btn.label || `Botão ${i + 1}`}
              </span>
            ))}
          </div>
        )}

        {/* Lista de opções */}
        {hasList && (
          <div className="space-y-0.5">
            {nd.listItems!.slice(0, 3).map((item, i) => (
              <p key={item.id || i} className="text-[9px] text-muted-foreground">
                • {item.title || `Opção ${i + 1}`}
              </p>
            ))}
            {nd.listItems!.length > 3 && (
              <p className="text-[9px] text-muted-foreground">+{nd.listItems!.length - 3} mais</p>
            )}
          </div>
        )}

        {/* Delay */}
        {nd.nodeType === "delay" && nd.delay != null && (
          <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> {nd.delay}s de espera
          </p>
        )}

        {/* Webhook */}
        {nd.nodeType === "webhook_call" && nd.webhook?.url && (
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30 border border-border/50">
            <Globe className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground truncate font-mono">
              {nd.webhook.method} {nd.webhook.url.slice(0, 40)}{nd.webhook.url.length > 40 ? "…" : ""}
            </p>
          </div>
        )}

        {/* Variável */}
        {nd.nodeType === "set_variable" && nd.variable?.name && (
          <p className="text-[10px] text-muted-foreground">
            {nd.variable.name} {nd.variable.operation === "set" ? "=" : nd.variable.operation} {nd.variable.value}
          </p>
        )}

        {/* Captura de input */}
        {nd.nodeType === "input_capture" && nd.inputCapture?.variableName && (
          <p className="text-[10px] text-muted-foreground">
            📝 {`{{${nd.inputCapture.variableName}}}`} ({nd.inputCapture.validation})
          </p>
        )}

        {/* Mídia */}
        {nd.nodeType === "media" && nd.mediaType && (
          <p className="text-[10px] text-muted-foreground">
            📎 {nd.mediaType}{nd.mediaCaption ? ` — ${nd.mediaCaption.slice(0, 30)}` : ""}
          </p>
        )}

        {/* Condição */}
        {nd.nodeType === "condition" && nd.condition && (
          <p className="text-[10px] text-muted-foreground">
            {nd.condition.field || "campo"} {nd.condition.operator} {nd.condition.value || "valor"}
          </p>
        )}

        {/* Switch */}
        {nd.nodeType === "switch" && nd.switchCases && (
          <div className="space-y-0.5">
            {nd.switchCases.slice(0, 3).map((c, i) => (
              <p key={c.id || i} className="text-[9px] text-muted-foreground">• {c.label}</p>
            ))}
            {nd.switchCases.length > 3 && (
              <p className="text-[9px] text-muted-foreground">+{nd.switchCases.length - 3} casos</p>
            )}
          </div>
        )}

        {/* IA Response */}
        {nd.nodeType === "ai_response" && nd.prompt && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">
            {nd.prompt.slice(0, 70)}{nd.prompt.length > 70 ? "…" : ""}
          </p>
        )}

        {/* IA Intention */}
        {nd.nodeType === "ai_intention" && nd.aiIntention && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">
              🧠 {nd.aiIntention.intentions.length} campo(s) a coletar
            </p>
            {nd.aiIntention.intentions.slice(0, 3).map((f, i) => (
              <p key={i} className="text-[9px] text-muted-foreground">
                • {f.fieldName || "…"} {f.required ? "*" : ""} ({f.validation})
              </p>
            ))}
            <p className="text-[9px] text-muted-foreground">Máx {nd.aiIntention.maxTurns} turnos</p>
          </div>
        )}

        {/* IA Action */}
        {nd.nodeType === "ai_action" && nd.aiAction && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">⚙️ {nd.aiAction.actionType}</p>
            {nd.aiAction.actionDescription && (
              <p className="text-[9px] text-muted-foreground line-clamp-2">
                {nd.aiAction.actionDescription.slice(0, 60)}
              </p>
            )}
            {nd.aiAction.resultVar && (
              <p className="text-[9px] text-muted-foreground">→ {`{{${nd.aiAction.resultVar}}}`}</p>
            )}
          </div>
        )}

        {/* Crew Task */}
        {nd.nodeType === "crew_task" && nd.crewTask && (
          <div className="space-y-0.5 p-1.5 rounded bg-purple-500/5 border border-purple-200/50">
            <p className="text-[10px] text-purple-700 font-bold">👥 Executar Equipe</p>
            {nd.crewTask.crewId ? (
              <p className="text-[9px] text-purple-600 truncate italic">ID da Crew: {nd.crewTask.crewId.slice(0, 8)}...</p>
            ) : (
              <p className="text-[9px] text-destructive">Nenhuma equipe selecionada</p>
            )}
            <p className="text-[9px] text-purple-600">→ {`{{${nd.crewTask.resultVar}}}`}</p>
          </div>
        )}

        {/* IA Router */}
        {isRouter && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">
              🔀 {nd.aiRouter!.routes.length} rota(s)
            </p>
            {nd.aiRouter!.routes.map((r, i) => (
              <p key={i} className="text-[9px] text-muted-foreground">• {r.label}</p>
            ))}
          </div>
        )}

        {/* Transfer */}
        {nd.nodeType === "transfer_to_human" && nd.department && (
          <p className="text-[10px] text-muted-foreground">→ {nd.department}</p>
        )}

        {/* Bitrix CRM */}
        {nd.bitrixCrm && (
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

        {/* Bitrix Badge */}
        {(nd.nodeType === "bitrix_create_badge" || (nd as any).bitrixBadge) && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">
              🏷️ {(nd as any).bitrixBadge?.badgeCode || "..."}
            </p>
            {(nd as any).bitrixBadge?.headerTitle && (
              <p className="text-[9px] text-muted-foreground">{(nd as any).bitrixBadge.headerTitle}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Handles de saída ──────────────────────────────────────────────── */}

      {isCondition ? (
        // Condição: Verdadeiro (esquerda) / Falso (direita)
        <>
          <Handle type="source" position={Position.Bottom} id="true"
            style={{ left: "30%" }} className={HANDLE_TRUE} title="Verdadeiro ✓" />
          <Handle type="source" position={Position.Bottom} id="false"
            style={{ left: "70%" }} className={HANDLE_FALSE} title="Falso ✗" />
        </>
      ) : isSwitch && nd.switchCases ? (
        // Switch: um handle por caso + default
        <>
          {nd.switchCases.map((c, i) => (
            <Handle
              key={c.handleId}
              type="source"
              position={Position.Bottom}
              id={c.handleId}
              style={{ left: `${((i + 1) / (nd.switchCases!.length + 2)) * 100}%` }}
              className={`${HANDLE_BASE} !bg-amber-500`}
              title={c.label}
            />
          ))}
          <Handle type="source" position={Position.Bottom} id="default"
            style={{ left: `${((nd.switchCases.length + 1) / (nd.switchCases.length + 2)) * 100}%` }}
            className={HANDLE_EXIT} title="Padrão (default)" />
        </>
      ) : isLoop ? (
        // Loop: continuar (esquerda) / sair (direita)
        <>
          <Handle type="source" position={Position.Bottom} id="loop"
            style={{ left: "30%" }} className={HANDLE_LOOP} title="Continuar loop" />
          <Handle type="source" position={Position.Bottom} id="exit"
            style={{ left: "70%" }} className={HANDLE_EXIT} title="Sair do loop" />
        </>
      ) : isRouter && nd.aiRouter ? (
        // IA Router: um handle por rota
        <>
          {nd.aiRouter.routes.map((r, i) => (
            <Handle
              key={r.handleId}
              type="source"
              position={Position.Bottom}
              id={r.handleId}
              style={{ left: `${((i + 1) / (nd.aiRouter!.routes.length + 1)) * 100}%` }}
              className={`${HANDLE_BASE} !bg-teal-500`}
              title={r.label}
            />
          ))}
        </>
      ) : hasButtons ? (
        // Botões: um handle por botão + default (sem resposta)
        <>
          {nd.buttons!.map((btn, i) => (
            <Handle
              key={btn.id || i}
              type="source"
              position={Position.Bottom}
              id={`btn_${btn.id || i}`}
              style={{ left: `${((i + 1) / (nd.buttons!.length + 2)) * 100}%` }}
              className={`${HANDLE_BASE} !bg-blue-500`}
              title={btn.label || `Botão ${i + 1}`}
            />
          ))}
          <Handle type="source" position={Position.Bottom} id="default"
            style={{ left: `${((nd.buttons!.length + 1) / (nd.buttons!.length + 2)) * 100}%` }}
            className={HANDLE_EXIT} title="Sem resposta (timeout)" />
        </>
      ) : hasList ? (
        // Lista: um handle por item (máx. 5 visíveis) + default
        <>
          {nd.listItems!.slice(0, 5).map((item, i) => (
            <Handle
              key={item.id || i}
              type="source"
              position={Position.Bottom}
              id={`item_${item.id || i}`}
              style={{ left: `${((i + 1) / (Math.min(nd.listItems!.length, 5) + 2)) * 100}%` }}
              className={`${HANDLE_BASE} !bg-indigo-500`}
              title={item.title || `Opção ${i + 1}`}
            />
          ))}
          <Handle type="source" position={Position.Bottom} id="default"
            style={{ left: "90%" }} className={HANDLE_EXIT} title="Sem resposta" />
        </>
      ) : isIntention && nd.aiIntention?.failureHandleId ? (
        // AI Intention com rota de falha separada
        <>
          <Handle type="source" position={Position.Bottom} id="success"
            style={{ left: "35%" }} className={HANDLE_TRUE} title="Dados coletados ✓" />
          <Handle type="source" position={Position.Bottom} id="failure"
            style={{ left: "65%" }} className={HANDLE_FAILURE} title="Falha na coleta ✗" />
        </>
      ) : !isEnd ? (
        // Handle padrão único de saída
        <Handle type="source" position={Position.Bottom} className={HANDLE_DEFAULT} />
      ) : null}

      {/* Rótulos de handles para condição e loop */}
      {(isCondition || isLoop) && (
        <div className="flex justify-between px-3 pb-1.5">
          <span className="text-[8px] text-green-600 font-medium tracking-tight">
            {isCondition ? "Verdadeiro" : "Loop"}
          </span>
          <span className="text-[8px] text-red-500 font-medium tracking-tight">
            {isCondition ? "Falso" : "Sair"}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(CustomFlowNode);
