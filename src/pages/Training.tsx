import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Upload, Globe, FileText, Trash2, Search, Brain, BookOpen, Loader2, Eye, Pencil } from "lucide-react";

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string | null;
  source_type: string;
  source_url: string | null;
  file_type: string | null;
  status: string;
  chunks_count: number;
  created_at: string;
  updated_at: string;
}

export default function TrainingPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewDoc, setViewDoc] = useState<KnowledgeDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceType, setSourceType] = useState("text");

  const [newDoc, setNewDoc] = useState({
    title: "",
    content: "",
    source_type: "text",
    source_url: "",
  });

  useEffect(() => { loadDocuments(); }, []);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDocuments(data as unknown as KnowledgeDocument[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newDoc.title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    try {
      // Create the document
      const { data, error } = await supabase.from("knowledge_documents").insert({
        title: newDoc.title,
        content: newDoc.content || null,
        source_type: newDoc.source_type,
        source_url: newDoc.source_url || null,
        status: "processing",
      } as any).select().single();
      if (error) throw error;

      // Simple chunking for text content
      if (newDoc.content && newDoc.source_type === "text") {
        const chunks = chunkText(newDoc.content, 1000);
        const chunkInserts = chunks.map((chunk, i) => ({
          document_id: (data as any).id,
          chunk_index: i,
          content: chunk,
          tokens_count: Math.ceil(chunk.length / 4),
        }));
        await supabase.from("knowledge_chunks").insert(chunkInserts as any);
        await supabase.from("knowledge_documents").update({
          status: "ready",
          chunks_count: chunks.length,
        } as any).eq("id", (data as any).id);
      } else {
        await supabase.from("knowledge_documents").update({ status: "ready" } as any).eq("id", (data as any).id);
      }

      toast.success("Documento adicionado à base de conhecimento");
      setDialogOpen(false);
      setNewDoc({ title: "", content: "", source_type: "text", source_url: "" });
      loadDocuments();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Documento eliminado"); loadDocuments(); }
    setDeleteId(null);
  };

  const chunkText = (text: string, maxChars: number): string[] => {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = "";
    for (const s of sentences) {
      if ((current + s).length > maxChars && current) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += (current ? " " : "") + s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  };

  const filtered = documents.filter(d =>
    d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.content || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sourceIcons: Record<string, any> = {
    text: FileText,
    url: Globe,
    file: Upload,
    faq: Brain,
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-700",
    processing: "bg-blue-500/10 text-blue-700",
    ready: "bg-green-500/10 text-green-700",
    error: "bg-red-500/10 text-red-700",
  };

  return (
    <div>
      <PageHeader
        title="Treino & Base de Conhecimento"
        description="Adicione documentos, textos e URLs para treinar os agentes de IA"
      />

      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Pesquisar documentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Adicionar Documento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BookOpen className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{documents.length}</p>
              <p className="text-xs text-muted-foreground">Documentos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Brain className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{documents.reduce((acc, d) => acc + (d.chunks_count || 0), 0)}</p>
              <p className="text-xs text-muted-foreground">Chunks</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{documents.filter(d => d.status === "ready").length}</p>
              <p className="text-xs text-muted-foreground">Prontos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum documento na base de conhecimento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => {
            const Icon = sourceIcons[doc.source_type] || FileText;
            return (
              <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px]">{doc.source_type}</Badge>
                        <Badge className={`text-[10px] ${statusColors[doc.status] || ""}`}>{doc.status}</Badge>
                        <span className="text-[10px] text-muted-foreground">{doc.chunks_count} chunks</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDoc(doc)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(doc.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Documento</DialogTitle>
            <DialogDescription>Adicione conteúdo à base de conhecimento dos agentes.</DialogDescription>
          </DialogHeader>

          <Tabs value={newDoc.source_type} onValueChange={(v) => setNewDoc(prev => ({ ...prev, source_type: v }))}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="text"><FileText className="h-3 w-3 mr-1" /> Texto</TabsTrigger>
              <TabsTrigger value="url"><Globe className="h-3 w-3 mr-1" /> URL</TabsTrigger>
              <TabsTrigger value="faq"><Brain className="h-3 w-3 mr-1" /> FAQ</TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Título *</Label>
                <Input value={newDoc.title} onChange={(e) => setNewDoc(prev => ({ ...prev, title: e.target.value }))} placeholder="Ex: Guia de Cidadania Portuguesa" />
              </div>

              <TabsContent value="text" className="mt-0">
                <Label>Conteúdo</Label>
                <Textarea value={newDoc.content} onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))} rows={8} placeholder="Cole o texto do documento aqui..." />
              </TabsContent>

              <TabsContent value="url" className="mt-0">
                <Label>URL da Página</Label>
                <Input value={newDoc.source_url} onChange={(e) => setNewDoc(prev => ({ ...prev, source_url: e.target.value }))} placeholder="https://example.com/artigo" />
                <p className="text-[11px] text-muted-foreground mt-1">O conteúdo será extraído automaticamente.</p>
              </TabsContent>

              <TabsContent value="faq" className="mt-0">
                <Label>Perguntas e Respostas (formato Q&A)</Label>
                <Textarea value={newDoc.content} onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))} rows={8} placeholder={"P: Quanto tempo demora o processo?\nR: O processo geralmente leva 6 a 12 meses.\n\nP: Quais documentos são necessários?\nR: Certidão de nascimento, passaporte..."} />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewDoc?.title}</DialogTitle>
            <DialogDescription>Tipo: {viewDoc?.source_type} • {viewDoc?.chunks_count} chunks</DialogDescription>
          </DialogHeader>
          <div className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-lg max-h-[40vh] overflow-y-auto">
            {viewDoc?.content || "Sem conteúdo de texto."}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação eliminará o documento e todos os seus chunks da base de conhecimento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
