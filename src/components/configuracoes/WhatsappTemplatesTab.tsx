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
import { RefreshCw, Plus, Trash2, MessageSquare, Link as LinkIcon } from "lucide-react";

type Tpl = {
  id: string;
  element_name: string;
  category: string;
  language: string;
  body: string;
  footer: string | null;
  buttons: any[];
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type ButtonDraft = {
  type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
  example?: string;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  const v = (s || "").toUpperCase();
  if (v === "APPROVED" || v === "ENABLED") return "default";
  if (v === "REJECTED" || v === "DISABLED" || v === "FAILED") return "destructive";
  if (v === "PENDING" || v === "IN_APPEAL") return "secondary";
  return "outline";
};

export default function WhatsappTemplatesTab() {
  const [items, setItems] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    element_name: "",
    category: "UTILITY" as "MARKETING" | "UTILITY" | "AUTHENTICATION",
    language: "pt_BR",
    body: "",
    footer: "",
    button_url_example: "",
  });
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);

  const varCount = useMemo(() => {
    const m = form.body.match(/\{\{(\d+)\}\}/g) || [];
    return new Set(m).size;
  }, [form.body]);
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
      const { data: session } = await supabase.auth.getSession();
      const url = `${(supabase as any).functionsUrl || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co`}/whatsapp-templates-list?refresh=true`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.session?.access_token || ""}`,
          apikey: (supabase as any).supabaseKey || "",
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao sincronizar");
      setItems(json.templates || []);
      toast.success(`${json.synced || 0} templates sincronizados`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao sincronizar templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); }, []);

  async function submit() {
    if (!form.element_name || !form.body) {
      toast.error("Nome e corpo obrigatórios");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates-create", {
        body: {
          element_name: form.element_name,
          category: form.category,
          language: form.language,
          body: form.body,
          footer: form.footer || undefined,
          buttons,
          example: examples,
          button_url_example: form.button_url_example || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Template submetido. Aprovação Meta demora ~24h.");
      setOpen(false);
      setForm({ element_name: "", category: "UTILITY", language: "pt_BR", body: "", footer: "", button_url_example: "" });
      setButtons([]);
      setExamples([]);
      load(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao criar template");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(t: Tpl) {
    if (!confirm(`Apagar template "${t.element_name}"?`)) return;
    try {
      const { error } = await supabase.functions.invoke("whatsapp-templates-delete", {
        body: { id: t.id },
      });
      if (error) throw error;
      toast.success("Template apagado");
      load(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao apagar");
    }
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Templates WhatsApp
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Cria e submete templates HSM ao WhatsApp/Meta via Gupshup. Aprovação demora ~24h.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Novo template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Novo template WhatsApp</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nome (element_name)</Label>
                      <Input
                        value={form.element_name}
                        onChange={(e) => setForm((f) => ({ ...f, element_name: e.target.value }))}
                        placeholder="link_pagamento_pt"
                      />
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

                  <div>
                    <Label>Corpo (usa {"{{1}}"}, {"{{2}}"} para variáveis)</Label>
                    <Textarea
                      rows={5}
                      value={form.body}
                      onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                      placeholder="Olá {{1}}, segue o link do seu pagamento."
                    />
                  </div>

                  {varCount > 0 && (
                    <div className="space-y-2 rounded-md border p-3">
                      <Label className="text-xs uppercase text-muted-foreground">Exemplos das variáveis</Label>
                      {Array.from({ length: varCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-12">{"{{" + (i + 1) + "}}"}</span>
                          <Input
                            value={examples[i] || ""}
                            onChange={(e) => {
                              const next = [...examples];
                              next[i] = e.target.value;
                              setExamples(next);
                            }}
                            placeholder={`Exemplo ${i + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <Label>Rodapé (opcional)</Label>
                    <Input
                      value={form.footer}
                      onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
                      placeholder="Emmely Advocacia"
                    />
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Label className="mb-0">Botões</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setButtons([...buttons, { type: "URL", text: "", url: "" }])}>
                          <LinkIcon className="h-3 w-3" /> URL
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])}>
                          Quick reply
                        </Button>
                      </div>
                    </div>
                    {buttons.map((b, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end border-t pt-2">
                        <div className="col-span-2 text-xs text-muted-foreground">{b.type}</div>
                        <div className="col-span-4">
                          <Label className="text-xs">Texto</Label>
                          <Input value={b.text} onChange={(e) => {
                            const n = [...buttons]; n[i] = { ...b, text: e.target.value }; setButtons(n);
                          }} />
                        </div>
                        {b.type === "URL" && (
                          <div className="col-span-5">
                            <Label className="text-xs">URL (usa {"{{1}}"} para dinâmico)</Label>
                            <Input value={b.url || ""} onChange={(e) => {
                              const n = [...buttons]; n[i] = { ...b, url: e.target.value }; setButtons(n);
                            }} placeholder="https://pay.emmely.pt/{{1}}" />
                          </div>
                        )}
                        <div className="col-span-1">
                          <Button variant="ghost" size="icon" onClick={() => setButtons(buttons.filter((_, k) => k !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {buttons.some((b) => b.type === "URL" && /\{\{1\}\}/.test(b.url || "")) && (
                      <div>
                        <Label className="text-xs">Exemplo de URL dinâmica</Label>
                        <Input
                          value={form.button_url_example}
                          onChange={(e) => setForm((f) => ({ ...f, button_url_example: e.target.value }))}
                          placeholder="https://pay.emmely.pt/abc123"
                        />
                      </div>
                    )}
                  </div>

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
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
                    {t.rejection_reason && (
                      <p className="mt-1 text-xs text-destructive">Motivo: {t.rejection_reason}</p>
                    )}
                    {Array.isArray(t.buttons) && t.buttons.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.buttons.map((b: any, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {b.type}: {b.text}
                          </Badge>
                        ))}
                      </div>
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
