import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Plus, Trash2, MessageSquare, Link as LinkIcon, Image as ImageIcon, Video, FileText, MapPin, Phone, Copy, LayoutGrid, ChevronDown, ChevronUp } from "lucide-react";

type Tpl = {
  id: string;
  element_name: string;
  category: string;
  language: string;
  template_type?: string;
  body: string;
  footer: string | null;
  header: any;
  cards: any;
  buttons: any[];
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type ButtonDraft = {
  type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER" | "COPY_CODE";
  text: string;
  url?: string;
  phone_number?: string;
  example?: string;
  is_stripe_token?: boolean;
  is_emmely_token?: boolean;
};

type TemplateType = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | "CAROUSEL";

type CarouselCardDraft = {
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  body: string;
  bodyExamples: string[];
  buttons: ButtonDraft[];
  _open?: boolean;
};

const STRIPE_BUTTON_URL_TEMPLATE = "https://checkout.stripe.com/c/pay/{{1}}";
const EMMELY_BUTTON_URL_TEMPLATE = "https://emmelycloud.pages.dev/pagamento/{{1}}";

const TEMPLATE_TYPES: { value: TemplateType; label: string; icon: any }[] = [
  { value: "TEXT", label: "Texto", icon: MessageSquare },
  { value: "IMAGE", label: "Imagem", icon: ImageIcon },
  { value: "VIDEO", label: "Vídeo", icon: Video },
  { value: "DOCUMENT", label: "Documento", icon: FileText },
  { value: "LOCATION", label: "Localização", icon: MapPin },
  { value: "CAROUSEL", label: "Carrossel", icon: LayoutGrid },
];

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  const v = (s || "").toUpperCase();
  if (v === "APPROVED" || v === "ENABLED") return "default";
  if (v === "REJECTED" || v === "DISABLED" || v === "FAILED") return "destructive";
  if (v === "PENDING" || v === "IN_APPEAL") return "secondary";
  return "outline";
};

function countVars(text: string) {
  const m = (text || "").match(/\{\{(\d+)\}\}/g) || [];
  return new Set(m).size;
}

function ButtonEditor({
  buttons,
  setButtons,
  buttonUrlExample,
  setButtonUrlExample,
  category,
  allowMedia = true,
  maxButtons = 10,
}: {
  buttons: ButtonDraft[];
  setButtons: (b: ButtonDraft[]) => void;
  buttonUrlExample?: string;
  setButtonUrlExample?: (v: string) => void;
  category: string;
  allowMedia?: boolean;
  maxButtons?: number;
}) {
  const add = (b: ButtonDraft) => {
    if (buttons.length >= maxButtons) {
      toast.error(`Máximo ${maxButtons} botões`);
      return;
    }
    setButtons([...buttons, b]);
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="mb-0">Botões</Label>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => add({ type: "URL", text: "", url: "" })}>
            <LinkIcon className="h-3 w-3" /> URL
          </Button>
          {allowMedia && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => add({ type: "URL", text: "Pagar", url: STRIPE_BUTTON_URL_TEMPLATE, is_stripe_token: true })}>
                💳 Stripe
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => add({ type: "URL", text: "Pagar", url: EMMELY_BUTTON_URL_TEMPLATE, is_emmely_token: true })}>
                🔗 Emmely
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => add({ type: "QUICK_REPLY", text: "" })}>
            Quick reply
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => add({ type: "PHONE_NUMBER", text: "", phone_number: "" })}>
            <Phone className="h-3 w-3" /> Telefone
          </Button>
          {category === "AUTHENTICATION" && (
            <Button type="button" variant="outline" size="sm" onClick={() => add({ type: "COPY_CODE", text: "Copiar código", example: "123456" })}>
              <Copy className="h-3 w-3" /> Copy Code
            </Button>
          )}
        </div>
      </div>
      {buttons.map((b, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-end border-t pt-2">
          <div className="col-span-2 text-xs text-muted-foreground">
            {b.is_stripe_token ? "STRIPE" : b.is_emmely_token ? "EMMELY" : b.type}
          </div>
          {b.type !== "COPY_CODE" && (
            <div className="col-span-4">
              <Label className="text-xs">Texto</Label>
              <Input value={b.text} onChange={(e) => {
                const n = [...buttons]; n[i] = { ...b, text: e.target.value }; setButtons(n);
              }} />
            </div>
          )}
          {b.type === "URL" && (
            <div className="col-span-5">
              <Label className="text-xs">
                {b.is_stripe_token ? "URL (fixa Stripe)" : b.is_emmely_token ? "URL (fixa Emmely)" : "URL (usa {{1}} para dinâmico)"}
              </Label>
              <Input
                value={b.is_stripe_token ? STRIPE_BUTTON_URL_TEMPLATE : b.is_emmely_token ? EMMELY_BUTTON_URL_TEMPLATE : (b.url || "")}
                disabled={b.is_stripe_token || b.is_emmely_token}
                onChange={(e) => {
                  const n = [...buttons]; n[i] = { ...b, url: e.target.value }; setButtons(n);
                }}
                placeholder="https://pay.emmely.pt/{{1}}"
              />
            </div>
          )}
          {b.type === "PHONE_NUMBER" && (
            <div className="col-span-5">
              <Label className="text-xs">Telefone (E.164)</Label>
              <Input value={b.phone_number || ""} onChange={(e) => {
                const n = [...buttons]; n[i] = { ...b, phone_number: e.target.value }; setButtons(n);
              }} placeholder="+351912345678" />
            </div>
          )}
          {b.type === "COPY_CODE" && (
            <div className="col-span-9">
              <Label className="text-xs">Exemplo de código</Label>
              <Input value={b.example || ""} onChange={(e) => {
                const n = [...buttons]; n[i] = { ...b, example: e.target.value }; setButtons(n);
              }} placeholder="123456" />
            </div>
          )}
          <div className="col-span-1">
            <Button variant="ghost" size="icon" onClick={() => setButtons(buttons.filter((_, k) => k !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      {setButtonUrlExample && buttons.some((b) => b.type === "URL" && !b.is_stripe_token && !b.is_emmely_token && /\{\{1\}\}/.test(b.url || "")) && (
        <div>
          <Label className="text-xs">Exemplo de URL dinâmica</Label>
          <Input value={buttonUrlExample || ""} onChange={(e) => setButtonUrlExample(e.target.value)} placeholder="https://pay.emmely.pt/abc123" />
        </div>
      )}
    </div>
  );
}

export default function WhatsappTemplatesTab() {
  const [items, setItems] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    element_name: "",
    category: "UTILITY" as "MARKETING" | "UTILITY" | "AUTHENTICATION",
    language: "pt_BR",
    templateType: "TEXT" as TemplateType,
    body: "",
    footer: "",
    button_url_example: "",
    headerText: "",
    headerMediaUrl: "",
  });
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [cards, setCards] = useState<CarouselCardDraft[]>([]);

  const varCount = useMemo(() => countVars(form.body), [form.body]);
  const [examples, setExamples] = useState<string[]>([]);

  useEffect(() => {
    setExamples((prev) => {
      const next = [...prev];
      while (next.length < varCount) next.push("");
      next.length = varCount;
      return next;
    });
  }, [varCount]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_templates" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data as any) || []);
    } catch (e: any) {
      toast.error(e.message || "Falha ao carregar templates");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates-list", { body: { refresh: true } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setItems((data as any)?.templates || []);
      toast.success(`${(data as any)?.synced || 0} templates sincronizados`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao sincronizar templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setForm({ element_name: "", category: "UTILITY", language: "pt_BR", templateType: "TEXT", body: "", footer: "", button_url_example: "", headerText: "", headerMediaUrl: "" });
    setButtons([]);
    setCards([]);
    setExamples([]);
  }

  function addCard() {
    if (cards.length >= 10) return toast.error("Máximo 10 cards");
    setCards([...cards, { mediaType: "IMAGE", mediaUrl: "", body: "", bodyExamples: [], buttons: [], _open: true }]);
  }

  async function submit() {
    if (!form.element_name || !form.body) return toast.error("Nome e corpo obrigatórios");

    if (form.templateType === "CAROUSEL") {
      if (cards.length < 2) return toast.error("Carrossel precisa de pelo menos 2 cards");
      if (cards.some((c) => !c.mediaUrl || !c.body)) return toast.error("Cada card precisa de URL de media e corpo");
    }
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(form.templateType) && !form.headerMediaUrl) {
      return toast.error("URL de media de exemplo é obrigatória para templates de " + form.templateType);
    }

    setSubmitting(true);
    try {
      const header = form.templateType === "TEXT" && form.headerText
        ? { type: "TEXT", text: form.headerText }
        : ["IMAGE", "VIDEO", "DOCUMENT"].includes(form.templateType)
          ? { type: form.templateType, example: form.headerMediaUrl }
          : form.templateType === "LOCATION"
            ? { type: "LOCATION" }
            : null;

      const cardsPayload = form.templateType === "CAROUSEL"
        ? cards.map((c) => ({
            mediaType: c.mediaType,
            mediaUrl: c.mediaUrl,
            body: c.body,
            bodyExamples: c.bodyExamples,
            buttons: c.buttons,
          }))
        : undefined;

      const { data, error } = await supabase.functions.invoke("whatsapp-templates-create", {
        body: {
          element_name: form.element_name,
          category: form.category,
          language: form.language,
          templateType: form.templateType,
          body: form.body,
          footer: form.footer || undefined,
          header,
          buttons: form.templateType === "CAROUSEL" ? [] : buttons,
          example: examples,
          button_url_example: form.button_url_example || undefined,
          cards: cardsPayload,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        const g = (data as any)?.gupshup;
        throw new Error((data as any).error + (g ? ` — ${JSON.stringify(g).slice(0, 300)}` : ""));
      }
      toast.success("Template submetido. Aprovação Meta demora ~24h.");
      setOpen(false);
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.message || "Falha ao criar template");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(t: Tpl) {
    if (!confirm(`Apagar template "${t.element_name}"?`)) return;
    try {
      const { error } = await supabase.functions.invoke("whatsapp-templates-delete", { body: { id: t.id } });
      if (error) throw error;
      toast.success("Template apagado");
      load();
    } catch (e: any) {
      toast.error(e.message || "Falha ao apagar");
    }
  }

  const isMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(form.templateType);
  const isCarousel = form.templateType === "CAROUSEL";

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Templates WhatsApp
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Cria e submete templates HSM ao WhatsApp/Meta via Gupshup. Suporta texto, media, localização, carrossel e todos os tipos de botões. Aprovação demora ~24h.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Novo template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Novo template WhatsApp</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nome (element_name)</Label>
                      <Input value={form.element_name} onChange={(e) => setForm((f) => ({ ...f, element_name: e.target.value }))} placeholder="link_pagamento_pt" />
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Select value={form.category} onValueChange={(v: any) => setForm((f) => ({ ...f, category: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UTILITY">Utility</SelectItem>
                          <SelectItem value="MARKETING">Marketing</SelectItem>
                          <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo de template</Label>
                      <Select value={form.templateType} onValueChange={(v: any) => setForm((f) => ({ ...f, templateType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Idioma</Label>
                      <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pt_BR">Português (BR)</SelectItem>
                          <SelectItem value="pt_PT">Português (PT)</SelectItem>
                          <SelectItem value="en_US">English (US)</SelectItem>
                          <SelectItem value="es_ES">Español</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* HEADER */}
                  {form.templateType === "TEXT" && (
                    <div>
                      <Label>Header de texto (opcional, máx 60 chars)</Label>
                      <Input value={form.headerText} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, headerText: e.target.value }))} placeholder="Cabeçalho — pode conter {{1}}" />
                    </div>
                  )}
                  {isMediaHeader && (
                    <div>
                      <Label>URL de {form.templateType.toLowerCase()} de exemplo (obrigatório para aprovação)</Label>
                      <Input value={form.headerMediaUrl} onChange={(e) => setForm((f) => ({ ...f, headerMediaUrl: e.target.value }))} placeholder={form.templateType === "IMAGE" ? "https://.../imagem.jpg" : form.templateType === "VIDEO" ? "https://.../video.mp4" : "https://.../doc.pdf"} />
                      <p className="mt-1 text-[10px] text-muted-foreground">Meta exige uma URL pública para validar o template. Em runtime pode-se enviar outra media.</p>
                    </div>
                  )}
                  {form.templateType === "LOCATION" && (
                    <div className="rounded-md bg-muted p-3 text-xs">
                      Templates de localização recebem lat/long em runtime — não precisam de exemplo aqui.
                    </div>
                  )}

                  {/* BODY */}
                  <div>
                    <Label>{isCarousel ? "Mensagem que acompanha o carrossel" : "Corpo"} (usa {"{{1}}"}, {"{{2}}"} para variáveis)</Label>
                    <Textarea rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Olá {{1}}, segue a informação." />
                  </div>

                  {varCount > 0 && (
                    <div className="space-y-2 rounded-md border p-3">
                      <Label className="text-xs uppercase text-muted-foreground">Exemplos das variáveis</Label>
                      {Array.from({ length: varCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-12">{"{{" + (i + 1) + "}}"}</span>
                          <Input value={examples[i] || ""} onChange={(e) => {
                            const next = [...examples]; next[i] = e.target.value; setExamples(next);
                          }} placeholder={`Exemplo ${i + 1}`} />
                        </div>
                      ))}
                    </div>
                  )}

                  {!isCarousel && (
                    <div>
                      <Label>Rodapé (opcional)</Label>
                      <Input value={form.footer} onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))} placeholder="Emmely Advocacia" />
                    </div>
                  )}

                  {/* BUTTONS (não-carrossel) */}
                  {!isCarousel && (
                    <ButtonEditor
                      buttons={buttons}
                      setButtons={setButtons}
                      buttonUrlExample={form.button_url_example}
                      setButtonUrlExample={(v) => setForm((f) => ({ ...f, button_url_example: v }))}
                      category={form.category}
                    />
                  )}

                  {/* CAROUSEL CARDS */}
                  {isCarousel && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <Label className="mb-0">Cards do carrossel ({cards.length}/10)</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addCard}>
                          <Plus className="h-3 w-3" /> Adicionar card
                        </Button>
                      </div>
                      {cards.length < 2 && (
                        <p className="text-xs text-muted-foreground">Adiciona pelo menos 2 cards.</p>
                      )}
                      {cards.map((c, ci) => {
                        const cardVars = countVars(c.body);
                        return (
                          <div key={ci} className="rounded border">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                              <button className="flex items-center gap-2 text-sm font-medium" onClick={() => {
                                const n = [...cards]; n[ci] = { ...c, _open: !c._open }; setCards(n);
                              }}>
                                {c._open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                Card {ci + 1}
                              </button>
                              <Button variant="ghost" size="icon" onClick={() => setCards(cards.filter((_, i) => i !== ci))}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            {c._open && (
                              <div className="p-3 space-y-3">
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-xs">Tipo de media</Label>
                                    <Select value={c.mediaType} onValueChange={(v: any) => {
                                      const n = [...cards]; n[ci] = { ...c, mediaType: v }; setCards(n);
                                    }}>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="IMAGE">Imagem</SelectItem>
                                        <SelectItem value="VIDEO">Vídeo</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-2">
                                    <Label className="text-xs">URL de media de exemplo</Label>
                                    <Input value={c.mediaUrl} onChange={(e) => {
                                      const n = [...cards]; n[ci] = { ...c, mediaUrl: e.target.value }; setCards(n);
                                    }} placeholder="https://..." />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs">Corpo do card</Label>
                                  <Textarea rows={3} value={c.body} onChange={(e) => {
                                    const n = [...cards]; n[ci] = { ...c, body: e.target.value }; setCards(n);
                                  }} placeholder="Descrição do produto {{1}}" />
                                </div>
                                {cardVars > 0 && (
                                  <div className="space-y-1">
                                    <Label className="text-xs uppercase text-muted-foreground">Exemplos</Label>
                                    {Array.from({ length: cardVars }).map((_, vi) => (
                                      <div key={vi} className="flex items-center gap-2">
                                        <span className="text-xs w-12">{"{{" + (vi + 1) + "}}"}</span>
                                        <Input value={c.bodyExamples[vi] || ""} onChange={(e) => {
                                          const n = [...cards];
                                          const ex = [...(c.bodyExamples || [])];
                                          ex[vi] = e.target.value;
                                          n[ci] = { ...c, bodyExamples: ex };
                                          setCards(n);
                                        }} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <ButtonEditor
                                  buttons={c.buttons}
                                  setButtons={(bs) => {
                                    const n = [...cards]; n[ci] = { ...c, buttons: bs }; setCards(n);
                                  }}
                                  category={form.category}
                                  allowMedia={false}
                                  maxButtons={2}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="rounded-md bg-muted p-3 text-xs">
                    A aprovação Meta demora ~24h. O status muda automaticamente quando fizeres <b>Sincronizar</b>.
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={submit} disabled={submitting}>
                    {submitting ? "A submeter..." : "Submeter para aprovação"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum template ainda. Cria um novo ou sincroniza com o Gupshup.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{t.element_name}</span>
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                      <Badge variant="outline">{t.category}</Badge>
                      <Badge variant="outline">{t.language}</Badge>
                      {t.template_type && t.template_type !== "TEXT" && (
                        <Badge variant="secondary">{t.template_type}</Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
                    {t.rejection_reason && (
                      <p className="mt-1 text-xs text-destructive">Motivo: {t.rejection_reason}</p>
                    )}
                    {Array.isArray(t.buttons) && t.buttons.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.buttons.map((b: any, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {b.type}: {b.text || b.phone_number || b.example || ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {Array.isArray(t.cards) && t.cards.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">Carrossel com {t.cards.length} cards</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
