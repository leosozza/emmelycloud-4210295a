import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { X, Trash2, Plus } from "lucide-react";
import {
  NODE_TYPE_META, type FlowNodeData, type FlowNodeType,
  type FlowButtonItem, type FlowBitrixCRM, type FlowBitrixField,
  type FlowAIIntention, type FlowAIIntentionField,
  type FlowAIAction, type FlowAIRouter, type FlowAIRouterRoute,
  type FlowBitrixBadge,
} from "./FlowNodeTypes";
import BitrixFieldSelector from "./BitrixFieldSelector";

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

          {/* ═══ AI Intention ═══ */}
          {data.nodeType === "ai_intention" && (() => {
            const intention = data.aiIntention || { intentions: [], maxTurns: 5, successMessage: "", failureMessage: "" };
            const updateIntention = (patch: Partial<FlowAIIntention>) => update({ aiIntention: { ...intention, ...patch } });

            const addField = () => updateIntention({
              intentions: [...intention.intentions, { fieldName: "", description: "", validation: "text", required: true }]
            });
            const removeField = (i: number) => {
              const arr = [...intention.intentions];
              arr.splice(i, 1);
              updateIntention({ intentions: arr });
            };
            const updateField = (i: number, patch: Partial<FlowAIIntentionField>) => {
              const arr = [...intention.intentions];
              arr[i] = { ...arr[i], ...patch };
              updateIntention({ intentions: arr });
            };

            return (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold">Campos a coletar</Label>
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addField}>
                      <Plus className="h-3 w-3 mr-1" /> Campo
                    </Button>
                  </div>
                  {intention.intentions.map((field, i) => (
                    <div key={i} className="space-y-1 p-2 rounded border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground">Campo {i + 1}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeField(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input className="h-7 text-xs" value={field.fieldName} onChange={(e) => updateField(i, { fieldName: e.target.value })} placeholder="nome_variavel" />
                      <Input className="h-7 text-xs" value={field.description} onChange={(e) => updateField(i, { description: e.target.value })} placeholder="O que a IA deve perguntar..." />
                      <div className="flex gap-1">
                        <Select value={field.validation} onValueChange={(v) => updateField(i, { validation: v as any })}>
                          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="phone">Telefone</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="city">Cidade</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Switch checked={field.required} onCheckedChange={(v) => updateField(i, { required: v })} className="scale-75" />
                          <span className="text-[9px]">Obrig.</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Máx. turnos de conversa</Label>
                  <Input className="h-8 text-xs" type="number" min={1} max={20} value={intention.maxTurns} onChange={(e) => updateIntention({ maxTurns: parseInt(e.target.value) || 5 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Mensagem de sucesso</Label>
                  <Textarea className="text-xs min-h-[40px]" value={intention.successMessage} onChange={(e) => updateIntention({ successMessage: e.target.value })} placeholder="Obrigado! Coletei tudo." />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Mensagem de falha</Label>
                  <Textarea className="text-xs min-h-[40px]" value={intention.failureMessage} onChange={(e) => updateIntention({ failureMessage: e.target.value })} placeholder="Não consegui coletar..." />
                </div>
              </>
            );
          })()}

          {/* ═══ AI Action ═══ */}
          {data.nodeType === "ai_action" && (() => {
            const action = data.aiAction || { actionType: "custom", actionDescription: "", toolConfig: {}, resultVar: "" };
            const updateAction = (patch: Partial<FlowAIAction>) => update({ aiAction: { ...action, ...patch } });

            return (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de ação</Label>
                  <Select value={action.actionType} onValueChange={(v) => updateAction({ actionType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="schedule">Agendamento</SelectItem>
                      <SelectItem value="query_crm">Consultar CRM</SelectItem>
                      <SelectItem value="update_crm">Atualizar CRM</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Descrição da ação</Label>
                  <Textarea className="text-xs min-h-[60px]" value={action.actionDescription} onChange={(e) => updateAction({ actionDescription: e.target.value })} placeholder="Descreva o que a IA deve fazer em linguagem natural..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Variável de resultado</Label>
                  <Input className="h-8 text-xs" value={action.resultVar} onChange={(e) => updateAction({ resultVar: e.target.value })} placeholder="action_result" />
                </div>
                <div className="rounded bg-muted/50 p-2">
                  <p className="text-[9px] text-muted-foreground">💡 A IA usará tool calling para executar esta ação. Descreva com clareza o que deve ser feito.</p>
                </div>
              </>
            );
          })()}

          {/* ═══ AI Router ═══ */}
          {data.nodeType === "ai_router" && (() => {
            const router = data.aiRouter || { routes: [], analysisPrompt: "" };
            const updateRouter = (patch: Partial<FlowAIRouter>) => update({ aiRouter: { ...router, ...patch } });

            const addRoute = () => {
              const idx = router.routes.length;
              updateRouter({
                routes: [...router.routes, { label: `Rota ${idx + 1}`, description: "", handleId: `route_${idx}` }]
              });
            };
            const removeRoute = (i: number) => {
              const arr = [...router.routes];
              arr.splice(i, 1);
              updateRouter({ routes: arr });
            };
            const updateRoute = (i: number, patch: Partial<FlowAIRouterRoute>) => {
              const arr = [...router.routes];
              arr[i] = { ...arr[i], ...patch };
              updateRouter({ routes: arr });
            };

            return (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold">Rotas</Label>
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addRoute}>
                      <Plus className="h-3 w-3 mr-1" /> Rota
                    </Button>
                  </div>
                  {router.routes.map((route, i) => (
                    <div key={i} className="space-y-1 p-2 rounded border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground">Rota {i + 1}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeRoute(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input className="h-7 text-xs" value={route.label} onChange={(e) => updateRoute(i, { label: e.target.value })} placeholder="Nome da rota" />
                      <Textarea className="text-xs min-h-[30px]" value={route.description} onChange={(e) => updateRoute(i, { description: e.target.value })} placeholder="Quando seguir esta rota..." />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Prompt de análise</Label>
                  <Textarea className="text-xs min-h-[60px]" value={router.analysisPrompt} onChange={(e) => updateRouter({ analysisPrompt: e.target.value })} placeholder="Instrução adicional para a IA decidir qual rota seguir..." />
                </div>
              </>
            );
          })()}

          {/* Bitrix24 CRM */}
          {data.nodeType.startsWith("bitrix_") && data.nodeType !== "bitrix_create_badge" && (() => {
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
                      <div key={i} className="space-y-1 p-1.5 rounded border bg-muted/20">
                        <div className="flex items-center justify-between">
                          <BitrixFieldSelector
                            entity={crm.entity}
                            spaEntityTypeId={isSpa ? crm.spaEntityTypeId : undefined}
                            value={f.key}
                            onChange={(key) => updateField(i, { key })}
                            placeholder="Selecionar campo..."
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0 ml-1" onClick={() => removeField(i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input className="h-7 text-xs" value={f.value} onChange={(e) => updateField(i, { value: e.target.value })} placeholder="{{valor}} ou texto fixo" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">Variável de resultado</Label>
                  <Input className="h-8 text-xs" value={crm.resultVar} onChange={(e) => updateCrm({ resultVar: e.target.value })} placeholder="bitrix_result" />
                </div>

                <div className="rounded bg-muted/50 p-2">
                  <p className="text-[9px] text-muted-foreground">💡 Os campos são carregados em tempo real da API do Bitrix24. Pode também digitar manualmente.</p>
                </div>
              </>
            );
          })()}
          {/* ═══ Bitrix24 Badge ═══ */}
          {data.nodeType === "bitrix_create_badge" && (() => {
            const badge = data.bitrixBadge || { badgeCode: "", headerTitle: "", messagePreview: "", entityType: "deal", entityId: "", badgeType: "success" };
            const updateBadge = (patch: Partial<FlowBitrixBadge>) => update({ bitrixBadge: { ...badge, ...patch } });

            const presetBadges = [
              "emmely_bot_replied", "emmely_msg_sent", "emmely_msg_delivered", "emmely_msg_failed",
              "emmely_human_takeover", "emmely_payment_created", "emmely_payment_confirmed",
              "emmely_contract_signed", "emmely_baixa_imported",
            ];

            return (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Código da Badge</Label>
                  <Select value={presetBadges.includes(badge.badgeCode) ? badge.badgeCode : "_custom"} onValueChange={(v) => { if (v !== "_custom") updateBadge({ badgeCode: v }); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {presetBadges.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      <SelectItem value="_custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {(!presetBadges.includes(badge.badgeCode)) && (
                    <Input className="h-8 text-xs mt-1" value={badge.badgeCode} onChange={(e) => updateBadge({ badgeCode: e.target.value })} placeholder="meu_badge_code" />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Título</Label>
                  <Input className="h-8 text-xs" value={badge.headerTitle} onChange={(e) => updateBadge({ headerTitle: e.target.value })} placeholder="Ex: Pagamento Recebido" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Preview</Label>
                  <Input className="h-8 text-xs" value={badge.messagePreview} onChange={(e) => updateBadge({ messagePreview: e.target.value })} placeholder="Texto de preview na timeline" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de Entidade</Label>
                  <Select value={badge.entityType} onValueChange={(v) => updateBadge({ entityType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">ID da Entidade</Label>
                  <Input className="h-8 text-xs" value={badge.entityId} onChange={(e) => updateBadge({ entityId: e.target.value })} placeholder="{{deal_id}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de Badge</Label>
                  <Select value={badge.badgeType} onValueChange={(v) => updateBadge({ badgeType: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="success">Sucesso (verde)</SelectItem>
                      <SelectItem value="primary">Primário (azul)</SelectItem>
                      <SelectItem value="warning">Alerta (amarelo)</SelectItem>
                      <SelectItem value="failure">Erro (vermelho)</SelectItem>
                      <SelectItem value="secondary">Secundário (cinza)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded bg-muted/50 p-2">
                  <p className="text-[9px] text-muted-foreground">🏷️ Cria uma badge visual na timeline do CRM Bitrix24. Use variáveis {"{{deal_id}}"} nos campos.</p>
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
