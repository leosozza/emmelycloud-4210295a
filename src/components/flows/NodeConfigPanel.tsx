import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Plus } from "lucide-react";
import { NODE_TYPE_META, type FlowNodeData, type FlowNodeType, type FlowButtonItem, type FlowBitrixCRM, type FlowBitrixField } from "./FlowNodeTypes";

interface NodeConfigPanelProps {
  data: FlowNodeData;
  onChange: (data: FlowNodeData) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function NodeConfigPanel({ data, onChange, onDelete, onClose }: NodeConfigPanelProps) {
  const meta = NODE_TYPE_META[data.nodeType as FlowNodeType];
  if (!meta) return null;

  const Icon = meta.icon;

  const update = (patch: Partial<FlowNodeData>) => onChange({ ...data, ...patch });

  const addButton = () => {
    const btns = [...(data.buttons || [])];
    if (btns.length >= 3) return;
    btns.push({ id: `btn_${Date.now()}`, label: "" });
    update({ buttons: btns });
  };

  const removeButton = (idx: number) => {
    const btns = [...(data.buttons || [])];
    btns.splice(idx, 1);
    update({ buttons: btns });
  };

  const updateButton = (idx: number, label: string) => {
    const btns = [...(data.buttons || [])];
    btns[idx] = { ...btns[idx], label };
    update({ buttons: btns });
  };

  return (
    <div className="w-72 border-l bg-card flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
          <span className="text-xs font-semibold truncate">{meta.label}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Label */}
          <div className="space-y-1">
            <Label className="text-[11px]">Nome do bloco</Label>
            <Input className="h-8 text-xs" value={data.label || ""} onChange={(e) => update({ label: e.target.value })} placeholder={meta.label} />
          </div>

          {/* Message */}
          {(data.nodeType === "message" || data.nodeType === "message_buttons") && (
            <div className="space-y-1">
              <Label className="text-[11px]">Mensagem</Label>
              <Textarea className="text-xs min-h-[80px]" value={data.message || ""} onChange={(e) => update({ message: e.target.value })} placeholder="Escreva a mensagem..." />
              <p className="text-[9px] text-muted-foreground">Use {"{{variavel}}"} para inserir dados dinâmicos</p>
            </div>
          )}

          {/* Buttons */}
          {data.nodeType === "message_buttons" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Botões (máx. 3)</Label>
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addButton} disabled={(data.buttons || []).length >= 3}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {(data.buttons || []).map((btn, i) => (
                <div key={btn.id} className="flex gap-1">
                  <Input className="h-7 text-xs flex-1" value={btn.label} onChange={(e) => updateButton(i, e.target.value)} placeholder={`Botão ${i + 1}`} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeButton(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Media */}
          {data.nodeType === "media" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo de media</Label>
                <Select value={data.mediaType || "image"} onValueChange={(v) => update({ mediaType: v as any })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="audio">Áudio</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">URL do ficheiro</Label>
                <Input className="h-8 text-xs" value={data.mediaUrl || ""} onChange={(e) => update({ mediaUrl: e.target.value })} placeholder="https://..." />
              </div>
            </>
          )}

          {/* Condition */}
          {data.nodeType === "condition" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo de condição</Label>
                <Select value={data.condition?.type || "equals"} onValueChange={(v) => update({ condition: { ...data.condition!, type: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Igual a</SelectItem>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="starts_with">Começa com</SelectItem>
                    <SelectItem value="regex">Regex</SelectItem>
                    <SelectItem value="exists">Existe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Campo</Label>
                <Input className="h-8 text-xs" value={data.condition?.field || ""} onChange={(e) => update({ condition: { ...data.condition!, field: e.target.value } })} placeholder="Ex: {{mensagem}}" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Valor</Label>
                <Input className="h-8 text-xs" value={data.condition?.value || ""} onChange={(e) => update({ condition: { ...data.condition!, value: e.target.value } })} placeholder="Valor esperado" />
              </div>
            </>
          )}

          {/* Delay */}
          {data.nodeType === "delay" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Segundos de espera</Label>
              <Input className="h-8 text-xs" type="number" min={1} value={data.delay || 5} onChange={(e) => update({ delay: parseInt(e.target.value) || 5 })} />
            </div>
          )}

          {/* AI Response */}
          {data.nodeType === "ai_response" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Persona ID (opcional)</Label>
                <Input className="h-8 text-xs" value={data.personaId || ""} onChange={(e) => update({ personaId: e.target.value })} placeholder="UUID do agente" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Prompt personalizado</Label>
                <Textarea className="text-xs min-h-[60px]" value={data.prompt || ""} onChange={(e) => update({ prompt: e.target.value })} placeholder="Instrução extra para a IA..." />
              </div>
            </>
          )}

          {/* Webhook */}
          {data.nodeType === "webhook" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">URL</Label>
                <Input className="h-8 text-xs" value={data.webhook?.url || ""} onChange={(e) => update({ webhook: { ...data.webhook!, url: e.target.value } })} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Método</Label>
                <Select value={data.webhook?.method || "POST"} onValueChange={(v) => update({ webhook: { ...data.webhook!, method: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Body (JSON)</Label>
                <Textarea className="text-xs min-h-[60px] font-mono" value={data.webhook?.body || ""} onChange={(e) => update({ webhook: { ...data.webhook!, body: e.target.value } })} placeholder='{"key": "value"}' />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Variável de resposta</Label>
                <Input className="h-8 text-xs" value={data.webhook?.responseVar || ""} onChange={(e) => update({ webhook: { ...data.webhook!, responseVar: e.target.value } })} placeholder="webhook_result" />
              </div>
            </>
          )}

          {/* Variable */}
          {data.nodeType === "set_variable" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Nome da variável</Label>
                <Input className="h-8 text-xs" value={data.variable?.name || ""} onChange={(e) => update({ variable: { ...data.variable!, name: e.target.value } })} placeholder="nome_var" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Valor</Label>
                <Input className="h-8 text-xs" value={data.variable?.value || ""} onChange={(e) => update({ variable: { ...data.variable!, value: e.target.value } })} placeholder="valor ou {{variavel}}" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Escopo</Label>
                <Select value={data.variable?.scope || "conversation"} onValueChange={(v) => update({ variable: { ...data.variable!, scope: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conversation">Conversa</SelectItem>
                    <SelectItem value="contact">Contato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Transfer */}
          {data.nodeType === "transfer" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Departamento</Label>
                <Input className="h-8 text-xs" value={data.department || ""} onChange={(e) => update({ department: e.target.value })} placeholder="Ex: suporte, vendas" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mensagem de transferência</Label>
                <Textarea className="text-xs min-h-[40px]" value={data.transferMessage || ""} onChange={(e) => update({ transferMessage: e.target.value })} placeholder="Vou transferir para um atendente..." />
              </div>
            </>
          )}

          {/* Input Capture */}
          {data.nodeType === "input_capture" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">Pergunta</Label>
                <Textarea className="text-xs min-h-[40px]" value={data.inputCapture?.question || ""} onChange={(e) => update({ inputCapture: { ...data.inputCapture!, question: e.target.value } })} placeholder="Qual o seu nome?" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Nome da variável</Label>
                <Input className="h-8 text-xs" value={data.inputCapture?.variableName || ""} onChange={(e) => update({ inputCapture: { ...data.inputCapture!, variableName: e.target.value } })} placeholder="nome_cliente" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Validação</Label>
                <Select value={data.inputCapture?.validation || "text"} onValueChange={(v) => update({ inputCapture: { ...data.inputCapture!, validation: v as any } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Timeout (segundos)</Label>
                <Input className="h-8 text-xs" type="number" min={5} value={data.inputCapture?.timeout || 60} onChange={(e) => update({ inputCapture: { ...data.inputCapture!, timeout: parseInt(e.target.value) || 60 } })} />
              </div>
            </>
          )}

          {/* Loop */}
          {data.nodeType === "loop" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Número de repetições</Label>
              <Input className="h-8 text-xs" type="number" min={1} value={data.loopCount || 3} onChange={(e) => update({ loopCount: parseInt(e.target.value) || 3 })} />
            </div>
          )}

          {/* Switch Persona */}
          {data.nodeType === "switch_persona" && (
            <div className="space-y-1">
              <Label className="text-[11px]">ID da Persona</Label>
              <Input className="h-8 text-xs" value={data.personaId || ""} onChange={(e) => update({ personaId: e.target.value })} placeholder="UUID do agente" />
            </div>
          )}

          {/* Bitrix24 CRM */}
          {data.nodeType.startsWith("bitrix_") && (() => {
            const crm = data.bitrixCrm || { entity: "lead", operation: "create", entityId: "", spaEntityTypeId: "", fields: [], resultVar: "", pipeline: "", stageId: "" };
            const updateCrm = (patch: Partial<FlowBitrixCRM>) => update({ bitrixCrm: { ...crm, ...patch } });
            const needsId = crm.operation === "get" || crm.operation === "update" || crm.operation === "delete";
            const needsFields = crm.operation === "create" || crm.operation === "update";
            const isSpa = crm.entity === "spa";

            const addField = () => updateCrm({ fields: [...crm.fields, { key: "", value: "" }] });
            const removeField = (i: number) => { const f = [...crm.fields]; f.splice(i, 1); updateCrm({ fields: f }); };
            const updateField = (i: number, patch: Partial<FlowBitrixField>) => {
              const f = [...crm.fields];
              f[i] = { ...f[i], ...patch };
              updateCrm({ fields: f });
            };

            return (
              <>
                {needsId && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">ID da Entidade</Label>
                    <Input className="h-8 text-xs" value={crm.entityId} onChange={(e) => updateCrm({ entityId: e.target.value })} placeholder="{{lead_id}}" />
                  </div>
                )}

                {isSpa && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">ID do Tipo SPA</Label>
                    <Input className="h-8 text-xs" type="number" value={crm.spaEntityTypeId} onChange={(e) => updateCrm({ spaEntityTypeId: e.target.value })} placeholder="Ex: 128" />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">Pipeline / Categoria</Label>
                  <Input className="h-8 text-xs" value={crm.pipeline} onChange={(e) => updateCrm({ pipeline: e.target.value })} placeholder="Opcional" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Estágio</Label>
                  <Input className="h-8 text-xs" value={crm.stageId} onChange={(e) => updateCrm({ stageId: e.target.value })} placeholder="Ex: NEW, WON" />
                </div>

                {needsFields && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px]">Campos</Label>
                      <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addField}>
                        <Plus className="h-3 w-3 mr-1" /> Campo
                      </Button>
                    </div>
                    {crm.fields.map((f, i) => (
                      <div key={i} className="flex gap-1">
                        <Input className="h-7 text-xs w-1/3" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} placeholder="TITLE" />
                        <Input className="h-7 text-xs flex-1" value={f.value} onChange={(e) => updateField(i, { value: e.target.value })} placeholder="{{valor}}" />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeField(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">Variável de resultado</Label>
                  <Input className="h-8 text-xs" value={crm.resultVar} onChange={(e) => updateCrm({ resultVar: e.target.value })} placeholder="bitrix_result" />
                </div>

                <div className="rounded bg-muted/50 p-2">
                  <p className="text-[9px] text-muted-foreground font-medium mb-1">Campos comuns Bitrix24:</p>
                  <p className="text-[9px] text-muted-foreground">TITLE, NAME, LAST_NAME, PHONE, EMAIL, COMPANY_TITLE, OPPORTUNITY, STAGE_ID, CATEGORY_ID, ASSIGNED_BY_ID</p>
                </div>
              </>
            );
          })()}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t">
        <Button variant="destructive" size="sm" className="w-full text-xs" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-1" /> Excluir bloco
        </Button>
      </div>
    </div>
  );
}
