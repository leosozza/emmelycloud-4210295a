/**
 * CustomFlowNode.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente de renderização visual de cada nó no canvas do construtor de fluxos.
 * Suporta todos os tipos definidos em FlowNodeTypes.ts com handles de saída corretos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_TYPE_META, type FlowNodeData, type FlowNodeType } from "./FlowNodeTypes";

// ─── Constantes de estilo dos handles ────────────────────────────────────────
const HANDLE_BASE = "!w-3 !h-3 !border-2 !border-background";
const HANDLE_DEFAULT = `${HANDLE_BASE} !bg-muted-foreground`;
const HANDLE_TRUE = `${HANDLE_BASE} !bg-green-500`;
const HANDLE_FALSE = `${HANDLE_BASE} !bg-red-500`;
const HANDLE_LOOP = `${HANDLE_BASE} !bg-purple-500`;
const HANDLE_EXIT = `${HANDLE_BASE} !bg-gray-400`;
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
      className="min-w-[190px] max-w-[250px] rounded-xl bg-card border-2 shadow-md transition-all"
      style={{
        borderColor: selected ? meta.color : `${meta.color}60`,
        boxShadow: selected ? `0 0 0 3px ${meta.color}30, 0 4px 12px rgba(0,0,0,0.15)` : "0 2px 6px rgba(0,0,0,0.08)",
      }}
    >
      {/* Handle de entrada (topo) — ausente em nós de início implícito */}
      <Handle
        type="target"
        position={Position.Top}
        className={HANDLE_DEFAULT}
      />

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: `${meta.color}15` }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${meta.color}25` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>
        <span className="text-[11px] font-semibold text-foreground truncate flex-1">
          {nd.label || meta.label}
        </span>
      </div>

      {/* ── Corpo / Preview ───────────────────────────────────────────────── */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Mensagem de texto */}
        {nd.message && (
          <p className="text-[10px] text-muted-foreground leading-tight line-clamp-3">
            {nd.message.slice(0, 90)}{nd.message.length > 90 ? "…" : ""}
          </p>
        )}

        {/* Botões */}
        {hasButtons && (
          <div className="flex flex-wrap gap-1 mt-1">
            {nd.buttons!.map((btn, i) => (
              <span
                key={btn.id || i}
                className="text-[9px] px-1.5 py-0.5 rounded-md font-medium border"
                style={{ borderColor: `${meta.color}50`, color: meta.color, backgroundColor: `${meta.color}10` }}
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
          <p className="text-[10px] text-muted-foreground">⏱ {nd.delay}s de espera</p>
        )}

        {/* Webhook */}
        {nd.nodeType === "webhook_call" && nd.webhook?.url && (
          <p className="text-[10px] text-muted-foreground truncate">
            {nd.webhook.method} {nd.webhook.url.slice(0, 40)}{nd.webhook.url.length > 40 ? "…" : ""}
          </p>
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
            {nd.bitrixCrm.filters && nd.bitrixCrm.filters.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Filtro: {nd.bitrixCrm.filters[0].field} = {nd.bitrixCrm.filters[0].value}
              </p>
            )}
            {nd.bitrixCrm.resultVar && (
              <p className="text-[10px] text-muted-foreground">→ {`{{${nd.bitrixCrm.resultVar}}}`}</p>
            )}
          </div>
        )}

        {/* Bitrix Comment */}
        {nd.nodeType === "bitrix_add_comment" && nd.bitrixComment && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">
              {nd.bitrixComment.entityType} #{nd.bitrixComment.entityId}
            </p>
            {nd.bitrixComment.comment && (
              <p className="text-[9px] text-muted-foreground line-clamp-2">
                {nd.bitrixComment.comment.slice(0, 60)}
              </p>
            )}
          </div>
        )}

        {/* Bitrix Activity */}
        {nd.nodeType === "bitrix_add_activity" && nd.bitrixActivity && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">{nd.bitrixActivity.subject || "Atividade"}</p>
            <p className="text-[9px] text-muted-foreground">
              {nd.bitrixActivity.entityType} #{nd.bitrixActivity.entityId}
            </p>
          </div>
        )}

        {/* Bitrix Assign */}
        {nd.nodeType === "bitrix_assign_user" && nd.bitrixAssign && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">
              {nd.bitrixAssign.entityType} #{nd.bitrixAssign.entityId}
            </p>
            <p className="text-[9px] text-muted-foreground">
              Responsável: {nd.bitrixAssign.userId || "não definido"}
            </p>
          </div>
        )}

        {/* Bitrix Badge */}
        {nd.nodeType === "bitrix_create_badge" && nd.bitrixBadge && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground font-medium">
              🏷️ {nd.bitrixBadge.badgeCode || "código não definido"}
            </p>
            {nd.bitrixBadge.headerTitle && (
              <p className="text-[9px] text-muted-foreground">{nd.bitrixBadge.headerTitle}</p>
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
              style={{ left: `${((i + 1) / Math.min(nd.listItems!.length, 5) + 2) * 100}%` }}
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
          <span className="text-[8px] text-green-600 font-medium">
            {isCondition ? "Verdadeiro" : "Loop"}
          </span>
          <span className="text-[8px] text-red-500 font-medium">
            {isCondition ? "Falso" : "Sair"}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(CustomFlowNode);
