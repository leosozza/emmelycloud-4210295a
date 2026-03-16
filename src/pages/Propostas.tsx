import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Pencil, Trash2, Send, Check, X, Copy, ExternalLink, Download, LayoutTemplate, FileText } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Tables, Constants } from "@/integrations/supabase/types";
import { PropostaForm } from "@/components/propostas/PropostaForm";
import { PropostaTemplateForm } from "@/components/propostas/PropostaTemplateForm";
import { useLocale } from "@/contexts/LocaleContext";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";

type Proposal = Tables<"proposals">;

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho", enviada: "Enviada", aceita: "Aceita", recusada: "Recusada", expirada: "Expirada",
};
const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviada: "bg-info text-info-foreground",
  aceita: "bg-success text-success-foreground",
  recusada: "bg-destructive text-destructive-foreground",
  expirada: "bg-warning text-warning-foreground",
};
const paymentTypeLabels: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado",
};

const PropostasPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProposta, setEditingProposta] = useState<Proposal | null>(null);
  const [preselectedCaseId, setPreselectedCaseId] = useState<string | null>(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const { toast } = useToast();
  const { formatCurrency } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const caseIdParam = searchParams.get("case_id");
    if (caseIdParam) {
      setPreselectedCaseId(caseIdParam);
      setEditingProposta(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["proposal-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const casesMap = Object.fromEntries(cases.map((c) => [c.id, c.title]));

  // Proposal mutations
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingProposta) {
        const { error } = await supabase.from("proposals").update(data).eq("id", editingProposta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proposals").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      setFormOpen(false);
      setEditingProposta(null);
      toast({ title: editingProposta ? "Proposta atualizada" : "Proposta criada" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "aceita") {
        // Use centralized Edge Function for acceptance
        const res = await supabase.functions.invoke("proposal-accept", {
          body: { proposal_id: id },
        });
        if (res.error) throw new Error(res.error.message);
        const data = res.data as any;
        if (data?.error) throw new Error(data.error);
      } else {
        const { error } = await supabase.from("proposals").update({ status: status as any }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["contracts-from-proposals"] });
      toast({ title: status === "aceita" ? "Proposta aceita — contrato ativado" : "Status atualizado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Proposta eliminada" });
    },
  });

  // Template mutations
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingTemplate) {
        const { error } = await supabase.from("proposal_templates").update(data).eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proposal_templates").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposal-templates"] });
      setTemplateFormOpen(false);
      setEditingTemplate(null);
      toast({ title: editingTemplate ? "Modelo atualizado" : "Modelo criado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposal_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposal-templates"] });
      toast({ title: "Modelo eliminado" });
    },
  });

  const handleDuplicateTemplate = (t: any) => {
    const { id, created_at, updated_at, ...rest } = t;
    saveTemplateMutation.mutate({ ...rest, name: `${rest.name} (cópia)` });
  };

  const handleCopyLink = (p: any) => {
    const token = p.accept_token;
    if (!token) {
      toast({ title: "Token não disponível", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/proposta/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado!" });
  };

  const handlePreview = (p: any) => {
    const token = p.accept_token;
    if (token) window.open(`/proposta/${token}`, "_blank");
  };

  const handleDownloadPdf = async (p: any) => {
    toast({ title: "A gerar PDF...", description: "Aguarde um momento." });
    try {
      const { data, error } = await supabase.functions.invoke("proposal-pdf", {
        body: { proposal_id: p.id },
      });
      if (error) throw error;
      if (data?.pdf_url) {
        window.open(data.pdf_url, "_blank");
      }
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    }
  };

  const filtered = proposals
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <PageHeader title="Propostas" description="Criação e gestão de propostas de honorários">
        <Button onClick={() => { setEditingProposta(null); setFormOpen(true); }} className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-full">
          <Plus className="mr-2 h-4 w-4" /> Nova Proposta
        </Button>
      </PageHeader>

      <Tabs defaultValue="propostas">
        <TabsList>
          <TabsTrigger value="propostas" className="gap-2">
            <FileText className="h-4 w-4" /> Propostas
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-2">
            <LayoutTemplate className="h-4 w-4" /> Modelos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="propostas">
          <div className="flex gap-3 items-center mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Constants.public.Enums.proposal_status.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Caso</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="w-48">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">A carregar...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma proposta encontrada</TableCell></TableRow>
                ) : filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-sm">
                      <Button variant="link" size="sm" className="p-0 h-auto text-sm" onClick={() => navigate("/casos")}>
                        {casesMap[p.case_id] || "—"}
                      </Button>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{formatCurrency(p.value)}</TableCell>
                    <TableCell className="text-sm">{paymentTypeLabels[p.payment_type]}{p.installments && p.installments > 1 ? ` (${p.installments}x)` : ""}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[p.status]}`}>{statusLabels[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.valid_until ? format(parseISO(p.valid_until), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button variant="ghost" size="icon" title="Copiar Link" onClick={() => handleCopyLink(p)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Pré-visualizar" onClick={() => handlePreview(p)}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Descarregar PDF" onClick={() => handleDownloadPdf(p)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {p.status === "rascunho" && (
                          <Button variant="ghost" size="icon" title="Enviar" onClick={() => updateStatusMutation.mutate({ id: p.id, status: "enviada" })}>
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {p.status === "enviada" && (
                          <>
                            <Button variant="ghost" size="icon" title="Aceitar" onClick={() => updateStatusMutation.mutate({ id: p.id, status: "aceita" })}>
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Recusar" onClick={() => updateStatusMutation.mutate({ id: p.id, status: "recusada" })}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { setEditingProposta(p); setFormOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="modelos">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Crie modelos reutilizáveis para preencher propostas rapidamente.</p>
            <Button onClick={() => { setEditingTemplate(null); setTemplateFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Modelo
            </Button>
          </div>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <LayoutTemplate className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Nenhum modelo criado</h3>
                <p className="text-sm text-muted-foreground mt-1">Crie modelos para agilizar a criação de propostas.</p>
                <Button className="mt-4" onClick={() => { setEditingTemplate(null); setTemplateFormOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" /> Criar Primeiro Modelo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t: any) => (
                <Card key={t.id} className="group hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        {t.title && <CardDescription className="mt-1">{t.title}</CardDescription>}
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {paymentTypeLabels[t.payment_type] || t.payment_type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {t.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{t.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">€{Number(t.value).toFixed(2)}</span>
                      {t.installments > 1 && (
                        <span className="text-xs text-muted-foreground">{t.installments}x parcelas</span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingTemplate(t); setTemplateFormOpen(true); }}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDuplicateTemplate(t)}>
                        <Copy className="h-3 w-3 mr-1" /> Duplicar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTemplateMutation.mutate(t.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PropostaForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setPreselectedCaseId(null);
        }}
        proposta={editingProposta}
        cases={cases}
        onSave={(data) => saveMutation.mutate(data)}
        saving={saveMutation.isPending}
        preselectedCaseId={preselectedCaseId}
      />

      <PropostaTemplateForm
        open={templateFormOpen}
        onOpenChange={(open) => {
          setTemplateFormOpen(open);
          if (!open) setEditingTemplate(null);
        }}
        template={editingTemplate}
        onSave={(data) => saveTemplateMutation.mutate(data)}
        saving={saveTemplateMutation.isPending}
      />
    </div>
  );
};

export default PropostasPage;
