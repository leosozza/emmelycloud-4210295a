/**
 * NodeConfigPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel lateral de configuração do nó selecionado no canvas.
 * Cada tipo de nó tem seu próprio formulário com validações e dicas contextuais.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Trash2, Plus, Info, ChevronDown, ChevronUp } from "lucide-react";
import {
  NODE_TYPE_META, SYSTEM_VARIABLES,
  type FlowNodeData, type FlowNodeType,
  type FlowButtonItem, type FlowListItem,
  type FlowBitrixCRM, type FlowBitrixField, type FlowBitrixFilter,
  type FlowAIIntention, type FlowAIIntentionField,
  type FlowAIAction, type FlowAIRouter, type FlowAIRouterRoute,
  type FlowBitrixBadge, type FlowBitrixComment,
  type FlowBitrixActivity, type FlowBitrixAssign,
  type FlowSwitchCase, type FlowCondition,
} from "./FlowNodeTypes";
import BitrixFieldSelector from "./BitrixFieldSelector";

// ─── Props ────────────────────────────────────────────────────────────────────

interface NodeConfigPanelProps {
  data: FlowNodeData;
  onChange: (data: FlowNodeData) => void;
  onDelete: () => void;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldHint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 text-muted-foreground inline ml-1 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[220px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">
      {children}
    </p>
  );
}

function VarHint() {
  return (
    <p className="text-[9px] text-muted-foreground mt-0.5">
      Use <code className="text-[9px] bg-muted px-0.5 rounded">{"{{variavel}}"}</code> para dados dinâmicos
    </p>
  );
}

const OPERATOR_LABELS: Record<FlowCondition["operator"], string> = {
  equals: "Igual a",
  not_equals: "Diferente de",
  contains: "Contém",
  not_contains: "Não contém",
  starts_with: "Começa com",
  ends_with: "Termina com",
  greater_than: "Maior que",
  less_than: "Menor que",
  exists: "Existe (não vazio)",
  not_exists: "Não existe (vazio)",
  regex: "Regex",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function NodeConfigPanel({ data, onChange, onDelete, onClose }: NodeConfigPanelProps) {
  const [showVars, setShowVars] = useState(false);
  const [crews, setCrews] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<{ connectorId: string; connectorName: string; lineId: number; lineName: string; active?: boolean }[]>([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const meta = NODE_TYPE_META[data.nodeType as FlowNodeType];

  const isMessageNode = ["message", "message_buttons", "message_list", "media"].includes(data.nodeType);

  useEffect(() => {
    const loadCrews = async () => {
      const { data: crewsData } = await (supabase as any)
        .from("ai_crews")
        .select("id, name")
        .eq("is_active", true);
      if (crewsData) setCrews(crewsData);
    };
    loadCrews();
  }, []);

  useEffect(() => {
    if (!isMessageNode) return;
    const loadConnectors = async () => {
      setLoadingConnectors(true);
      try {
        const { data: result } = await supabase.functions.invoke("bitrix24-worker", {
          body: { _listConnectors: true },
        });
        if (result?.connectors) setConnectors(result.connectors);
      } catch (e) {
        console.error("Failed to load connectors:", e);
      } finally {
        setLoadingConnectors(false);
      }
    };
    loadConnectors();
  }, [isMessageNode]);

  if (!meta) return null;

  const Icon = meta.icon;
  const update = (patch: Partial<FlowNodeData>) => onChange({ ...data, ...patch });

  // ── Helpers de sub-estruturas ──────────────────────────────────────────────

  const updateCrm = (patch: Partial<FlowBitrixCRM>) =>
    update({ bitrixCrm: { ...data.bitrixCrm!, ...patch } });

  const addField = () => updateCrm({ fields: [...(data.bitrixCrm?.fields || []), { key: "", value: "" }] });
  const removeField = (i: number) => {
    const f = [...(data.bitrixCrm?.fields || [])];
    f.splice(i, 1);
    updateCrm({ fields: f });
  };
  const updateField = (i: number, patch: Partial<FlowBitrixField>) => {
    const f = [...(data.bitrixCrm?.fields || [])];
    f[i] = { ...f[i], ...patch };
    updateCrm({ fields: f });
  };

  const addFilter = () => updateCrm({ filters: [...(data.bitrixCrm?.filters || []), { field: "", value: "" }] });
  const removeFilter = (i: number) => {
    const f = [...(data.bitrixCrm?.filters || [])];
    f.splice(i, 1);
    updateCrm({ filters: f });
  };
  const updateFilter = (i: number, patch: Partial<FlowBitrixFilter>) => {
    const f = [...(data.bitrixCrm?.filters || [])];
    f[i] = { ...f[i], ...patch };
    updateCrm({ filters: f });
  };

  const addIntentionField = () => {
    const fields = [...(data.aiIntention?.intentions || [])];
    fields.push({ fieldName: "", description: "", validation: "text", required: true });
    update({ aiIntention: { ...data.aiIntention!, intentions: fields } });
  };
  const removeIntentionField = (i: number) => {
    const fields = [...(data.aiIntention?.intentions || [])];
    fields.splice(i, 1);
    update({ aiIntention: { ...data.aiIntention!, intentions: fields } });
  };
  const updateIntentionField = (i: number, patch: Partial<FlowAIIntentionField>) => {
    const fields = [...(data.aiIntention?.intentions || [])];
    fields[i] = { ...fields[i], ...patch };
    update({ aiIntention: { ...data.aiIntention!, intentions: fields } });
  };

  const addRoute = () => {
    const routes = [...(data.aiRouter?.routes || [])];
    routes.push({ label: `Rota ${routes.length + 1}`, description: "", handleId: `route_${routes.length}` });
    update({ aiRouter: { ...data.aiRouter!, routes } });
  };
  const removeRoute = (i: number) => {
    const routes = [...(data.aiRouter?.routes || [])];
    routes.splice(i, 1);
    update({ aiRouter: { ...data.aiRouter!, routes } });
  };

  const addSwitchCase = () => {
    const cases = [...(data.switchCases || [])];
    cases.push({ id: `case_${Date.now()}`, label: `Caso ${cases.length + 1}`, field: "", operator: "equals", value: "", handleId: `case_${cases.length}` });
    update({ switchCases: cases });
  };
  const removeSwitchCase = (i: number) => {
    const cases = [...(data.switchCases || [])];
    cases.splice(i, 1);
    update({ switchCases: cases });
  };
  const updateSwitchCase = (i: number, patch: Partial<FlowSwitchCase>) => {
    const cases = [...(data.switchCases || [])];
    cases[i] = { ...cases[i], ...patch };
    update({ switchCases: cases });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-80 border-l bg-card flex flex-col shrink-0 h-full">
      {/* Cabeçalho */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ borderBottomColor: `${meta.color}30` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${meta.color}20` }}>
            <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{meta.label}</p>
            <p className="text-[9px] text-muted-foreground truncate">{meta.description}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">

          {/* ── Nome do bloco (todos os tipos) ───────────────────────────── */}
          <div className="space-y-1">
            <Label className="text-[11px]">Nome do bloco</Label>
            <Input
              className="h-8 text-xs"
              value={data.label || ""}
              onChange={(e) => update({ label: e.target.value })}
              placeholder={meta.label}
            />
          </div>

          <Separator />

          {/* ── Seletor de Conector (nós de mensagem) ──────────────────── */}
          {isMessageNode && connectors.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[11px]">
                Enviar via
                <FieldHint text="Escolha o conector Bitrix24 para enviar. 'Padrão' usa WhatsApp/Instagram direto." />
              </Label>
              <Select
                value={data.connectorId ? `${data.connectorId}::${data.connectorLineId || 0}` : "default"}
                onValueChange={(v) => {
                  if (v === "default") {
                    update({ connectorId: undefined, connectorLineId: undefined });
                  } else {
                    const [cId, lId] = v.split("::");
                    update({ connectorId: cId, connectorLineId: parseInt(lId) || undefined });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">📱 Padrão (WhatsApp/Instagram)</SelectItem>
                  {connectors.map((c, i) => (
                    <SelectItem key={`${c.connectorId}-${c.lineId}-${i}`} value={`${c.connectorId}::${c.lineId}`}>
                      {c.active ? "🟢" : "🔴"} {c.connectorName} — {c.lineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isMessageNode && loadingConnectors && (
            <p className="text-[9px] text-muted-foreground">Carregando conectores...</p>
          )}

          {/* ══════════════════════════════════════════════════════════════
              MENSAGENS
          ══════════════════════════════════════════════════════════════ */}

          {/* message / message_buttons */}
          {(data.nodeType === "message" || data.nodeType === "message_buttons") && (
            <div className="space-y-1">
              <Label className="text-[11px]">Mensagem</Label>
              <Textarea
                className="text-xs min-h-[90px] resize-none"
                value={data.message || ""}
                onChange={(e) => update({ message: e.target.value })}
                placeholder="Escreva a mensagem..."
              />
              <VarHint />
            </div>
          )}

          {/* Botões */}
          {data.nodeType === "message_buttons" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Botões de Resposta (máx. 3)</Label>
                <Button
                  variant="outline" size="sm" className="h-6 text-[10px]"
                  onClick={() => {
                    const btns = [...(data.buttons || [])];
                    if (btns.length >= 3) return;
                    btns.push({ id: `btn_${Date.now()}`, label: "" });
                    update({ buttons: btns });
                  }}
                  disabled={(data.buttons || []).length >= 3}
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {(data.buttons || []).map((btn, i) => (
                <div key={btn.id} className="flex gap-1">
                  <Input
                    className="h-7 text-xs flex-1"
                    value={btn.label}
                    onChange={(e) => {
                      const btns = [...(data.buttons || [])];
                      btns[i] = { ...btns[i], label: e.target.value };
                      update({ buttons: btns });
                    }}
                    placeholder={`Botão ${i + 1} (máx. 20 chars)`}
                    maxLength={20}
                  />
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                    onClick={() => {
                      const btns = [...(data.buttons || [])];
                      btns.splice(i, 1);
                      update({ buttons: btns });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground">
                Cada botão cria uma saída independente no canvas.
              </p>
            </div>
          )}

          {/* message_list */}
          {data.nodeType === "message_list" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Mensagem / Título</Label>
                <Textarea
                  className="text-xs min-h-[60px] resize-none"
                  value={data.message || ""}
                  onChange={(e) => update({ message: e.target.value })}
                  placeholder="Texto acima da lista..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Título do botão de lista</Label>
                <Input
                  className="h-8 text-xs"
                  value={data.listTitle || ""}
                  onChange={(e) => update({ listTitle: e.target.value })}
                  placeholder="Ex: Ver opções"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">Itens da lista (máx. 10)</Label>
                  <Button
                    variant="outline" size="sm" className="h-6 text-[10px]"
                    onClick={() => {
                      const items = [...(data.listItems || [])];
                      if (items.length >= 10) return;
                      items.push({ id: `item_${Date.now()}`, title: "", description: "" });
                      update({ listItems: items });
                    }}
                    disabled={(data.listItems || []).length >= 10}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                </div>
                {(data.listItems || []).map((item, i) => (
                  <div key={item.id} className="space-y-1 p-2 rounded bg-muted/30 border">
                    <div className="flex gap-1">
                      <Input
                        className="h-7 text-xs flex-1"
                        value={item.title}
                        onChange={(e) => {
                          const items = [...(data.listItems || [])];
                          items[i] = { ...items[i], title: e.target.value };
                          update({ listItems: items });
                        }}
                        placeholder={`Opção ${i + 1}`}
                        maxLength={24}
                      />
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                        onClick={() => {
                          const items = [...(data.listItems || [])];
                          items.splice(i, 1);
                          update({ listItems: items });
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      className="h-7 text-xs"
                      value={item.description || ""}
                      onChange={(e) => {
                        const items = [...(data.listItems || [])];
                        items[i] = { ...items[i], description: e.target.value };
                        update({ listItems: items });
                      }}
                      placeholder="Descrição (opcional)"
                      maxLength={72}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* media */}
          {data.nodeType === "media" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo de mídia</Label>
                <Select
                  value={data.mediaType || "image"}
                  onValueChange={(v) => update({ mediaType: v as any })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">🖼️ Imagem</SelectItem>
                    <SelectItem value="video">🎥 Vídeo</SelectItem>
                    <SelectItem value="audio">🎵 Áudio</SelectItem>
                    <SelectItem value="document">📄 Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">URL do arquivo</Label>
                <Input
                  className="h-8 text-xs"
                  value={data.mediaUrl || ""}
                  onChange={(e) => update({ mediaUrl: e.target.value })}
                  placeholder="https://... ou {{url_variavel}}"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Legenda (opcional)</Label>
                <Input
                  className="h-8 text-xs"
                  value={data.mediaCaption || ""}
                  onChange={(e) => update({ mediaCaption: e.target.value })}
                  placeholder="Texto abaixo da mídia"
                />
              </div>
            </>
          )}

          {/* location */}
          {data.nodeType === "location" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Nome do local</Label>
                <Input className="h-8 text-xs" value={data.locationName || ""}
                  onChange={(e) => update({ locationName: e.target.value })} placeholder="Ex: Escritório Central" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Latitude</Label>
                  <Input className="h-8 text-xs" value={data.locationLat || ""}
                    onChange={(e) => update({ locationLat: e.target.value })} placeholder="-23.5505" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Longitude</Label>
                  <Input className="h-8 text-xs" value={data.locationLng || ""}
                    onChange={(e) => update({ locationLng: e.target.value })} placeholder="-46.6333" />
                </div>
              </div>
            </>
          )}

          {/* vcard */}
          {data.nodeType === "vcard" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Nome do contato</Label>
                <Input className="h-8 text-xs" value={data.vcardName || ""}
                  onChange={(e) => update({ vcardName: e.target.value })} placeholder="Nome completo" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Telefone</Label>
                <Input className="h-8 text-xs" value={data.vcardPhone || ""}
                  onChange={(e) => update({ vcardPhone: e.target.value })} placeholder="+55 11 99999-9999" />
              </div>
            </>
          )}

          {/* sticker */}
          {data.nodeType === "sticker" && (
            <div className="space-y-1">
              <Label className="text-[11px]">URL do sticker (.webp)</Label>
              <Input className="h-8 text-xs" value={data.stickerUrl || ""}
                onChange={(e) => update({ stickerUrl: e.target.value })} placeholder="https://..." />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              LÓGICA
          ══════════════════════════════════════════════════════════════ */}

          {/* condition */}
          {data.nodeType === "condition" && (
            <>
              <SectionTitle>Configuração da Condição</SectionTitle>
              <div className="space-y-1">
                <Label className="text-[11px]">Campo / Variável</Label>
                <Input className="h-8 text-xs" value={data.condition?.field || ""}
                  onChange={(e) => update({ condition: { ...data.condition!, field: e.target.value } })}
                  placeholder="Ex: {{nome_cliente}} ou {{button_response}}" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Operador</Label>
                <Select value={data.condition?.operator || "equals"}
                  onValueChange={(v) => update({ condition: { ...data.condition!, operator: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!["exists", "not_exists"].includes(data.condition?.operator || "") && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Valor</Label>
                  <Input className="h-8 text-xs" value={data.condition?.value || ""}
                    onChange={(e) => update({ condition: { ...data.condition!, value: e.target.value } })}
                    placeholder="Valor esperado" />
                </div>
              )}
              <div className="rounded bg-muted/40 p-2 text-[9px] text-muted-foreground">
                ✅ Handle verde = Verdadeiro &nbsp;|&nbsp; ❌ Handle vermelho = Falso
              </div>
            </>
          )}

          {/* switch */}
          {data.nodeType === "switch" && (
            <>
              <SectionTitle>Casos do Switch</SectionTitle>
              {(data.switchCases || []).map((c, i) => (
                <div key={c.id} className="space-y-1 p-2 rounded bg-muted/30 border">
                  <div className="flex items-center justify-between">
                    <Input className="h-7 text-xs flex-1 mr-1" value={c.label}
                      onChange={(e) => updateSwitchCase(i, { label: e.target.value })}
                      placeholder={`Caso ${i + 1}`} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => removeSwitchCase(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input className="h-7 text-xs" value={c.field}
                    onChange={(e) => updateSwitchCase(i, { field: e.target.value })}
                    placeholder="Campo: {{variavel}}" />
                  <Select value={c.operator}
                    onValueChange={(v) => updateSwitchCase(i, { operator: v as any })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!["exists", "not_exists"].includes(c.operator) && (
                    <Input className="h-7 text-xs" value={c.value}
                      onChange={(e) => updateSwitchCase(i, { value: e.target.value })}
                      placeholder="Valor" />
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addSwitchCase}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar Caso
              </Button>
              <p className="text-[9px] text-muted-foreground">O handle "Padrão" é acionado quando nenhum caso corresponde.</p>
            </>
          )}

          {/* delay */}
          {data.nodeType === "delay" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Segundos de espera
                <FieldHint text="Máximo de 10 segundos por limitação do Edge Function. Para delays maiores, use agendamento." />
              </Label>
              <Input className="h-8 text-xs" type="number" min={1} max={10}
                value={data.delay || 3}
                onChange={(e) => update({ delay: Math.min(10, parseInt(e.target.value) || 1) })} />
              <p className="text-[9px] text-muted-foreground">Máximo: 10 segundos</p>
            </div>
          )}

          {/* input_capture */}
          {data.nodeType === "input_capture" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Pergunta</Label>
                <Textarea className="text-xs min-h-[60px] resize-none"
                  value={data.inputCapture?.question || ""}
                  onChange={(e) => update({ inputCapture: { ...data.inputCapture!, question: e.target.value } })}
                  placeholder="Qual é o seu nome completo?" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Salvar em variável</Label>
                <Input className="h-8 text-xs"
                  value={data.inputCapture?.variableName || ""}
                  onChange={(e) => update({ inputCapture: { ...data.inputCapture!, variableName: e.target.value } })}
                  placeholder="nome_cliente" />
                <p className="text-[9px] text-muted-foreground">Será acessível como {`{{nome_cliente}}`}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Validação</Label>
                <Select value={data.inputCapture?.validation || "text"}
                  onValueChange={(v) => update({ inputCapture: { ...data.inputCapture!, validation: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Qualquer texto</SelectItem>
                    <SelectItem value="text">Texto (mín. 2 chars)</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="phone">Telefone (DDD + número)</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="date">Data (DD/MM/YYYY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mensagem de erro</Label>
                <Input className="h-8 text-xs"
                  value={data.inputCapture?.errorMessage || ""}
                  onChange={(e) => update({ inputCapture: { ...data.inputCapture!, errorMessage: e.target.value } })}
                  placeholder="Resposta inválida. Tente novamente." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Máx. tentativas</Label>
                  <Input className="h-8 text-xs" type="number" min={1} max={5}
                    value={data.inputCapture?.maxRetries || 3}
                    onChange={(e) => update({ inputCapture: { ...data.inputCapture!, maxRetries: parseInt(e.target.value) || 3 } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Timeout (seg)</Label>
                  <Input className="h-8 text-xs" type="number" min={30}
                    value={data.inputCapture?.timeout || 120}
                    onChange={(e) => update({ inputCapture: { ...data.inputCapture!, timeout: parseInt(e.target.value) || 120 } })} />
                </div>
              </div>
            </>
          )}

          {/* loop */}
          {data.nodeType === "loop" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Número de repetições</Label>
              <Input className="h-8 text-xs" type="number" min={1} max={10}
                value={data.loopCount || 3}
                onChange={(e) => update({ loopCount: parseInt(e.target.value) || 3 })} />
              <div className="rounded bg-muted/40 p-2 text-[9px] text-muted-foreground">
                🔄 Handle roxo = continuar loop &nbsp;|&nbsp; ⬜ Handle cinza = sair após N repetições
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              INTEGRAÇÕES
          ══════════════════════════════════════════════════════════════ */}

          {/* webhook_call */}
          {data.nodeType === "webhook_call" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">URL</Label>
                <Input className="h-8 text-xs" value={data.webhook?.url || ""}
                  onChange={(e) => update({ webhook: { ...data.webhook!, url: e.target.value } })}
                  placeholder="https://api.exemplo.com/endpoint" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Método HTTP</Label>
                <Select value={data.webhook?.method || "POST"}
                  onValueChange={(v) => update({ webhook: { ...data.webhook!, method: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.webhook?.method !== "GET" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Body (JSON)</Label>
                  <Textarea className="text-xs min-h-[70px] font-mono resize-none"
                    value={data.webhook?.body || ""}
                    onChange={(e) => update({ webhook: { ...data.webhook!, body: e.target.value } })}
                    placeholder={'{"telefone": "{{telefone}}", "nome": "{{nome_cliente}}"}'} />
                  <VarHint />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[11px]">Variável de resposta</Label>
                <Input className="h-8 text-xs" value={data.webhook?.responseVar || ""}
                  onChange={(e) => update({ webhook: { ...data.webhook!, responseVar: e.target.value } })}
                  placeholder="webhook_result" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Timeout (ms)</Label>
                <Input className="h-8 text-xs" type="number" min={1000} max={30000}
                  value={data.webhook?.timeoutMs || 10000}
                  onChange={(e) => update({ webhook: { ...data.webhook!, timeoutMs: parseInt(e.target.value) || 10000 } })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={data.webhook?.onErrorContinue ?? true}
                  onCheckedChange={(v) => update({ webhook: { ...data.webhook!, onErrorContinue: v } })}
                />
                <Label className="text-[11px]">Continuar fluxo em caso de erro</Label>
              </div>
            </>
          )}

          {/* set_variable */}
          {data.nodeType === "set_variable" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Nome da variável</Label>
                <Input className="h-8 text-xs" value={data.variable?.name || ""}
                  onChange={(e) => update({ variable: { ...data.variable!, name: e.target.value } })}
                  placeholder="nome_var (sem espaços)" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Operação</Label>
                <Select value={data.variable?.operation || "set"}
                  onValueChange={(v) => update({ variable: { ...data.variable!, operation: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Definir (set)</SelectItem>
                    <SelectItem value="append">Concatenar (append)</SelectItem>
                    <SelectItem value="increment">Incrementar (+N)</SelectItem>
                    <SelectItem value="decrement">Decrementar (-N)</SelectItem>
                    <SelectItem value="clear">Limpar (clear)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.variable?.operation !== "clear" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Valor</Label>
                  <Input className="h-8 text-xs" value={data.variable?.value || ""}
                    onChange={(e) => update({ variable: { ...data.variable!, value: e.target.value } })}
                    placeholder="valor ou {{outra_variavel}}" />
                  <VarHint />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[11px]">Escopo</Label>
                <Select value={data.variable?.scope || "conversation"}
                  onValueChange={(v) => update({ variable: { ...data.variable!, scope: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conversation">Conversa (temporário)</SelectItem>
                    <SelectItem value="contact">Contato (persistente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              IA INTELIGENTE
          ══════════════════════════════════════════════════════════════ */}

          {/* ai_response */}
          {data.nodeType === "ai_response" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Persona ID (opcional)</Label>
                <Input className="h-8 text-xs" value={data.personaId || ""}
                  onChange={(e) => update({ personaId: e.target.value })}
                  placeholder="UUID do agente (deixe vazio para usar o padrão)" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Instrução extra (prompt)</Label>
                <Textarea className="text-xs min-h-[70px] resize-none"
                  value={data.prompt || ""}
                  onChange={(e) => update({ prompt: e.target.value })}
                  placeholder="Ex: Responda de forma empática e ofereça ajuda adicional." />
              </div>
            </>
          )}

          {/* switch_persona */}
          {data.nodeType === "switch_persona" && (
            <div className="space-y-1">
              <Label className="text-[11px]">ID da Persona</Label>
              <Input className="h-8 text-xs" value={data.personaId || ""}
                onChange={(e) => update({ personaId: e.target.value })}
                placeholder="UUID do agente de IA" />
              <p className="text-[9px] text-muted-foreground">O agente selecionado assumirá o atendimento a partir deste ponto.</p>
            </div>
          )}

          {/* ai_intention */}
          {data.nodeType === "ai_intention" && (
            <>
              <SectionTitle>Campos a Coletar</SectionTitle>
              {(data.aiIntention?.intentions || []).map((field, i) => (
                <div key={i} className="space-y-1 p-2 rounded bg-muted/30 border">
                  <div className="flex items-center gap-1">
                    <Input className="h-7 text-xs flex-1"
                      value={field.fieldName}
                      onChange={(e) => updateIntentionField(i, { fieldName: e.target.value })}
                      placeholder="nome_variavel" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => removeIntentionField(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea className="text-xs min-h-[50px] resize-none"
                    value={field.description}
                    onChange={(e) => updateIntentionField(i, { description: e.target.value })}
                    placeholder="Instrução para a IA: como perguntar e identificar este campo" />
                  <div className="grid grid-cols-2 gap-1">
                    <Select value={field.validation}
                      onValueChange={(v) => updateIntentionField(i, { validation: v as any })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto</SelectItem>
                        <SelectItem value="phone">Telefone</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="city">Cidade</SelectItem>
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="date">Data</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5 pl-1">
                      <Switch checked={field.required}
                        onCheckedChange={(v) => updateIntentionField(i, { required: v })} />
                      <Label className="text-[10px]">Obrigatório</Label>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addIntentionField}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar Campo
              </Button>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Máx. turnos de conversa</Label>
                  <Input className="h-8 text-xs" type="number" min={2} max={20}
                    value={data.aiIntention?.maxTurns || 6}
                    onChange={(e) => update({ aiIntention: { ...data.aiIntention!, maxTurns: parseInt(e.target.value) || 6 } })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mensagem de sucesso</Label>
                <Textarea className="text-xs min-h-[50px] resize-none"
                  value={data.aiIntention?.successMessage || ""}
                  onChange={(e) => update({ aiIntention: { ...data.aiIntention!, successMessage: e.target.value } })}
                  placeholder="Perfeito! Coletei todas as informações." />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mensagem de falha</Label>
                <Textarea className="text-xs min-h-[50px] resize-none"
                  value={data.aiIntention?.failureMessage || ""}
                  onChange={(e) => update({ aiIntention: { ...data.aiIntention!, failureMessage: e.target.value } })}
                  placeholder="Não consegui coletar as informações. Vou transferir para um atendente." />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!data.aiIntention?.failureHandleId}
                  onCheckedChange={(v) => update({ aiIntention: { ...data.aiIntention!, failureHandleId: v ? "failure" : undefined } })}
                />
                <Label className="text-[11px]">Rota separada para falha</Label>
              </div>
            </>
          )}

          {/* ai_action */}
          {data.nodeType === "ai_action" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo de ação</Label>
                <Select value={data.aiAction?.actionType || "custom"}
                  onValueChange={(v) => update({ aiAction: { ...data.aiAction!, actionType: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="query_crm">Consultar CRM</SelectItem>
                    <SelectItem value="update_crm">Atualizar CRM</SelectItem>
                    <SelectItem value="schedule">Agendar</SelectItem>
                    <SelectItem value="search_knowledge">Buscar na Base de Conhecimento</SelectItem>
                    <SelectItem value="custom">Ação Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Descrição da ação (instrução para a IA)</Label>
                <Textarea className="text-xs min-h-[80px] resize-none"
                  value={data.aiAction?.actionDescription || ""}
                  onChange={(e) => update({ aiAction: { ...data.aiAction!, actionDescription: e.target.value } })}
                  placeholder="Descreva o que a IA deve fazer. Ex: Verifique no CRM se existe um deal aberto para o telefone {{telefone}} e retorne o ID." />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Variável de resultado</Label>
                <Input className="h-8 text-xs" value={data.aiAction?.resultVar || ""}
                  onChange={(e) => update({ aiAction: { ...data.aiAction!, resultVar: e.target.value } })}
                  placeholder="ai_action_result" />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={data.aiAction?.onErrorContinue ?? true}
                  onCheckedChange={(v) => update({ aiAction: { ...data.aiAction!, onErrorContinue: v } })}
                />
                <Label className="text-[11px]">Continuar em caso de erro</Label>
              </div>
            </>
          )}

          {/* ai_router */}
          {data.nodeType === "ai_router" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Prompt de análise</Label>
                <Textarea className="text-xs min-h-[70px] resize-none"
                  value={data.aiRouter?.analysisPrompt || ""}
                  onChange={(e) => update({ aiRouter: { ...data.aiRouter!, analysisPrompt: e.target.value } })}
                  placeholder="Com base na mensagem do cliente, identifique a intenção e escolha a rota mais adequada." />
              </div>
              <SectionTitle>Rotas</SectionTitle>
              {(data.aiRouter?.routes || []).map((route, i) => (
                <div key={route.handleId} className="space-y-1 p-2 rounded bg-muted/30 border">
                  <div className="flex items-center gap-1">
                    <Input className="h-7 text-xs flex-1"
                      value={route.label}
                      onChange={(e) => {
                        const routes = [...(data.aiRouter?.routes || [])];
                        routes[i] = { ...routes[i], label: e.target.value };
                        update({ aiRouter: { ...data.aiRouter!, routes } });
                      }}
                      placeholder={`Rota ${i + 1}`} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => removeRoute(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea className="text-xs min-h-[40px] resize-none"
                    value={route.description}
                    onChange={(e) => {
                      const routes = [...(data.aiRouter?.routes || [])];
                      routes[i] = { ...routes[i], description: e.target.value };
                      update({ aiRouter: { ...data.aiRouter!, routes } });
                    }}
                    placeholder="Quando esta rota deve ser escolhida?" />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addRoute}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar Rota
              </Button>
            </>
          )}

          {/* crew_task */}
          {data.nodeType === "crew_task" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Equipe (Crew)</Label>
                <Select
                  value={data.crewTask?.crewId || ""}
                  onValueChange={(v) => update({ crewTask: { ...data.crewTask!, crewId: v } })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione uma equipe..." /></SelectTrigger>
                  <SelectContent>
                    {crews.length > 0 ? (
                      crews.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>Nenhuma equipe ativa encontrada</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[9px] text-muted-foreground">Escolha a equipe de agentes para realizar a tarefa.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Variável de resultado</Label>
                <Input className="h-8 text-xs" value={data.crewTask?.resultVar || "crew_result"}
                  onChange={(e) => update({ crewTask: { ...data.crewTask!, resultVar: e.target.value } })}
                  placeholder="crew_result" />
                <VarHint />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={data.crewTask?.onErrorContinue ?? true}
                  onCheckedChange={(v) => update({ crewTask: { ...data.crewTask!, onErrorContinue: v } })}
                />
                <Label className="text-[11px]">Continuar fluxo em caso de erro</Label>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CONTROLE
          ══════════════════════════════════════════════════════════════ */}

          {/* transfer_to_human */}
          {data.nodeType === "transfer_to_human" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Departamento / Fila</Label>
                <Input className="h-8 text-xs" value={data.department || ""}
                  onChange={(e) => update({ department: e.target.value })}
                  placeholder="Ex: vendas, suporte, financeiro" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mensagem de transferência</Label>
                <Textarea className="text-xs min-h-[60px] resize-none"
                  value={data.transferMessage || ""}
                  onChange={(e) => update({ transferMessage: e.target.value })}
                  placeholder="Aguarde um momento, vou transferir você para um atendente. 👨‍💼" />
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              BITRIX24 — CRM (Lead, Deal, Contact, SPA)
          ══════════════════════════════════════════════════════════════ */}

          {data.bitrixCrm && (() => {
            const crm = data.bitrixCrm!;
            const isSpa = crm.entity === "spa";
            const isSearch = crm.operation === "search";
            const isMove = crm.operation === "move";
            const needsId = ["update", "get", "move"].includes(crm.operation);

            return (
              <>
                {isSpa && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">ID do Tipo de Entidade SPA (entityTypeId)
                      <FieldHint text="O entityTypeId é o número do Smart Process. Encontre em CRM > Configurações > Smart Processes." />
                    </Label>
                    <Input className="h-8 text-xs" value={crm.spaEntityTypeId}
                      onChange={(e) => updateCrm({ spaEntityTypeId: e.target.value })}
                      placeholder="Ex: 128" />
                  </div>
                )}

                {needsId && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">ID do elemento</Label>
                    <Input className="h-8 text-xs" value={crm.entityId}
                      onChange={(e) => updateCrm({ entityId: e.target.value })}
                      placeholder={`{{${crm.entity}_id}}`} />
                    <VarHint />
                  </div>
                )}

                {isMove && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Funil de destino (CATEGORY_ID)</Label>
                      <Input className="h-8 text-xs" value={crm.targetPipelineId || ""}
                        onChange={(e) => updateCrm({ targetPipelineId: e.target.value })}
                        placeholder="Ex: 0 (funil padrão)" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Estágio de destino (STAGE_ID)</Label>
                      <Input className="h-8 text-xs" value={crm.targetStageId || ""}
                        onChange={(e) => updateCrm({ targetStageId: e.target.value })}
                        placeholder="Ex: C1:NEW ou {{stage_id}}" />
                    </div>
                  </>
                )}

                {isSearch && (
                  <>
                    <SectionTitle>Filtros de Busca</SectionTitle>
                    {(crm.filters || []).map((f, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <Input className="h-7 text-xs w-24 shrink-0"
                          value={f.field}
                          onChange={(e) => updateFilter(i, { field: e.target.value })}
                          placeholder="Campo" />
                        <Input className="h-7 text-xs flex-1"
                          value={f.value}
                          onChange={(e) => updateFilter(i, { value: e.target.value })}
                          placeholder="{{telefone}}" />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => removeFilter(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addFilter}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar Filtro
                    </Button>
                  </>
                )}

                {!isSearch && !isMove && crm.operation !== "get" && (
                  <>
                    <SectionTitle>Campos</SectionTitle>
                    {(crm.fields || []).map((f, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex gap-1 items-center">
                          <BitrixFieldSelector
                            entity={isSpa ? "spa" : crm.entity as any}
                            spaEntityTypeId={isSpa ? crm.spaEntityTypeId : undefined}
                            value={f.key}
                            onChange={(key) => updateField(i, { key })}
                            placeholder="Selecionar campo..."
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0"
                            onClick={() => removeField(i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input className="h-7 text-xs" value={f.value}
                          onChange={(e) => updateField(i, { value: e.target.value })}
                          placeholder="{{valor}} ou texto fixo" />
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addField}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar Campo
                    </Button>
                  </>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">Variável de resultado</Label>
                  <Input className="h-8 text-xs" value={crm.resultVar}
                    onChange={(e) => updateCrm({ resultVar: e.target.value })}
                    placeholder={`${crm.entity}_result`} />
                  <p className="text-[9px] text-muted-foreground">
                    Acessível como {`{{${crm.resultVar || crm.entity + "_result"}}}`} nos próximos nós
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={crm.onErrorContinue ?? true}
                    onCheckedChange={(v) => updateCrm({ onErrorContinue: v })}
                  />
                  <Label className="text-[11px]">Continuar fluxo em caso de erro</Label>
                </div>

                <div className="rounded bg-muted/40 p-2">
                  <p className="text-[9px] text-muted-foreground">
                    💡 Os campos são carregados em tempo real da API do Bitrix24. Você também pode digitar manualmente.
                  </p>
                </div>
              </>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════════
              BITRIX24 — ATIVIDADES E TIMELINE
          ══════════════════════════════════════════════════════════════ */}

          {/* bitrix_add_comment */}
          {data.nodeType === "bitrix_add_comment" && (() => {
            const c = data.bitrixComment || { entityType: "deal", entityId: "", comment: "" };
            const upd = (p: Partial<FlowBitrixComment>) => update({ bitrixComment: { ...c, ...p } });
            return (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de entidade</Label>
                  <Select value={c.entityType} onValueChange={(v) => upd({ entityType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deal">Deal (Negociação)</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">ID da entidade</Label>
                  <Input className="h-8 text-xs" value={c.entityId}
                    onChange={(e) => upd({ entityId: e.target.value })}
                    placeholder={`{{${c.entityType}_id}}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Comentário</Label>
                  <Textarea className="text-xs min-h-[80px] resize-none" value={c.comment}
                    onChange={(e) => upd({ comment: e.target.value })}
                    placeholder="💬 Mensagem via WhatsApp: {{ultima_mensagem}}" />
                  <VarHint />
                </div>
              </>
            );
          })()}

          {/* bitrix_add_activity */}
          {data.nodeType === "bitrix_add_activity" && (() => {
            const a = data.bitrixActivity || { entityType: "deal", entityId: "", subject: "" };
            const upd = (p: Partial<FlowBitrixActivity>) => update({ bitrixActivity: { ...a, ...p } });
            return (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de entidade</Label>
                  <Select value={a.entityType} onValueChange={(v) => upd({ entityType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">ID da entidade</Label>
                  <Input className="h-8 text-xs" value={a.entityId}
                    onChange={(e) => upd({ entityId: e.target.value })}
                    placeholder={`{{${a.entityType}_id}}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Assunto</Label>
                  <Input className="h-8 text-xs" value={a.subject}
                    onChange={(e) => upd({ subject: e.target.value })}
                    placeholder="Retorno ao cliente" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Descrição</Label>
                  <Textarea className="text-xs min-h-[60px] resize-none" value={a.description || ""}
                    onChange={(e) => upd({ description: e.target.value })}
                    placeholder="Cliente solicitou contato. Telefone: {{telefone}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Prazo (YYYY-MM-DD HH:MM:SS)</Label>
                  <Input className="h-8 text-xs" value={a.deadline || ""}
                    onChange={(e) => upd({ deadline: e.target.value })}
                    placeholder="{{data_hoje}} ou 2026-12-31 18:00:00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Responsável (ID do usuário Bitrix)</Label>
                  <Input className="h-8 text-xs" value={a.responsibleId || ""}
                    onChange={(e) => upd({ responsibleId: e.target.value })}
                    placeholder="1 ou {{responsavel_id}}" />
                </div>
              </>
            );
          })()}

          {/* bitrix_assign_user */}
          {data.nodeType === "bitrix_assign_user" && (() => {
            const a = data.bitrixAssign || { entityType: "deal", entityId: "", userId: "" };
            const upd = (p: Partial<FlowBitrixAssign>) => update({ bitrixAssign: { ...a, ...p } });
            return (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de entidade</Label>
                  <Select value={a.entityType} onValueChange={(v) => upd({ entityType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contato</SelectItem>
                      <SelectItem value="spa">SPA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {a.entityType === "spa" && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">ID do Tipo SPA</Label>
                    <Input className="h-8 text-xs" value={a.spaEntityTypeId || ""}
                      onChange={(e) => upd({ spaEntityTypeId: e.target.value })}
                      placeholder="128" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[11px]">ID da entidade</Label>
                  <Input className="h-8 text-xs" value={a.entityId}
                    onChange={(e) => upd({ entityId: e.target.value })}
                    placeholder={`{{${a.entityType}_id}}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">ID do usuário responsável</Label>
                  <Input className="h-8 text-xs" value={a.userId}
                    onChange={(e) => upd({ userId: e.target.value })}
                    placeholder="1 ou {{responsavel_id}}" />
                  <p className="text-[9px] text-muted-foreground">Encontre o ID em Bitrix24 &gt; Usuários</p>
                </div>
              </>
            );
          })()}

          {/* bitrix_create_badge */}
          {data.nodeType === "bitrix_create_badge" && (() => {
            const badge = data.bitrixBadge || { badgeCode: "", headerTitle: "", messagePreview: "", entityType: "deal", entityId: "", badgeType: "success" };
            const upd = (p: Partial<FlowBitrixBadge>) => update({ bitrixBadge: { ...badge, ...p } });

            const presetBadges = [
              { value: "emmely_bot_replied", label: "Bot respondeu" },
              { value: "emmely_msg_sent", label: "Mensagem enviada" },
              { value: "emmely_msg_delivered", label: "Mensagem entregue" },
              { value: "emmely_msg_failed", label: "Falha no envio" },
              { value: "emmely_human_takeover", label: "Assumido por humano" },
              { value: "emmely_payment_created", label: "Cobrança criada" },
              { value: "emmely_payment_confirmed", label: "Pagamento confirmado" },
              { value: "emmely_contract_signed", label: "Contrato assinado" },
              { value: "emmely_lead_qualified", label: "Lead qualificado" },
            ];

            const isPreset = presetBadges.some(b => b.value === badge.badgeCode);

            return (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Código da Badge</Label>
                  <Select
                    value={isPreset ? badge.badgeCode : "_custom"}
                    onValueChange={(v) => { if (v !== "_custom") upd({ badgeCode: v }); else upd({ badgeCode: "" }); }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {presetBadges.map(b => (
                        <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                      ))}
                      <SelectItem value="_custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isPreset && (
                    <Input className="h-8 text-xs mt-1" value={badge.badgeCode}
                      onChange={(e) => upd({ badgeCode: e.target.value })}
                      placeholder="meu_badge_code (snake_case)" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Título</Label>
                  <Input className="h-8 text-xs" value={badge.headerTitle}
                    onChange={(e) => upd({ headerTitle: e.target.value })}
                    placeholder="Ex: Pagamento Confirmado ✅" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Preview (texto na timeline)</Label>
                  <Input className="h-8 text-xs" value={badge.messagePreview}
                    onChange={(e) => upd({ messagePreview: e.target.value })}
                    placeholder="Valor: R$ {{valor_pagamento}}" />
                  <VarHint />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de entidade</Label>
                  <Select value={badge.entityType} onValueChange={(v) => upd({ entityType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">ID da entidade</Label>
                  <Input className="h-8 text-xs" value={badge.entityId}
                    onChange={(e) => upd({ entityId: e.target.value })}
                    placeholder={`{{${badge.entityType}_id}}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo visual</Label>
                  <Select value={badge.badgeType} onValueChange={(v) => upd({ badgeType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="success">✅ Sucesso (verde)</SelectItem>
                      <SelectItem value="primary">🔵 Primário (azul)</SelectItem>
                      <SelectItem value="warning">⚠️ Alerta (amarelo)</SelectItem>
                      <SelectItem value="failure">❌ Erro (vermelho)</SelectItem>
                      <SelectItem value="secondary">⬜ Secundário (cinza)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════════
              COMPOSIÇÃO — CALL FLOW
          ══════════════════════════════════════════════════════════════ */}
          {data.nodeType === "call_flow" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">ID do Flow a chamar</Label>
                <Input
                  className="h-8 text-xs"
                  value={data.callFlowId || ""}
                  onChange={(e) => update({ callFlowId: e.target.value })}
                  placeholder="UUID do flow ou {{variavel}}"
                />
                <p className="text-[9px] text-muted-foreground">
                  Cole o ID do flow que deseja executar como sub-rotina. Encontre-o na lista de flows.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={data.callFlowPassVariables ?? true}
                  onCheckedChange={(v) => update({ callFlowPassVariables: v })}
                />
                <Label className="text-[11px]">Passar variáveis ao sub-flow</Label>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              VARIÁVEIS DE SISTEMA (expansível)
          ══════════════════════════════════════════════════════════════ */}
          <Separator />
          <button
            className="flex items-center justify-between w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowVars(!showVars)}
          >
            <span className="font-medium">📦 Variáveis de sistema disponíveis</span>
            {showVars ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showVars && (
            <div className="space-y-1">
              {SYSTEM_VARIABLES.map((v) => (
                <div key={v.name} className="flex items-start gap-1.5">
                  <code className="text-[9px] bg-muted px-1 py-0.5 rounded shrink-0 text-primary">{v.name}</code>
                  <p className="text-[9px] text-muted-foreground">{v.description}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </ScrollArea>

      {/* Rodapé */}
      <div className="p-3 border-t">
        <Button variant="destructive" size="sm" className="w-full text-xs" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-1" /> Excluir bloco
        </Button>
      </div>
    </div>
  );
}
