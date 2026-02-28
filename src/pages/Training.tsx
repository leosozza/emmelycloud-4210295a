import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Upload, Globe, FileText, Trash2, Search, Brain, BookOpen, Loader2, Eye, MessageSquare, X, Pencil } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string | null;
  source_type: string;
  source_url: string | null;
  file_type: string | null;
  file_path: string | null;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [componentError, setComponentError] = useState<string | null>(null);

  // Edit state
  const [editDoc, setEditDoc] = useState<KnowledgeDocument | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Conversation training state
  const [convDateFrom, setConvDateFrom] = useState("");
  const [convDateTo, setConvDateTo] = useState("");
  const [convPreview, setConvPreview] = useState<{ count: number; messages: number } | null>(null);
  const [loadingConvPreview, setLoadingConvPreview] = useState(false);

  const [newDoc, setNewDoc] = useState({
    title: "",
    content: "",
    source_type: "text",
    source_url: "",
  });

  useEffect(() => { loadDocuments(); }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setDocuments(data as unknown as KnowledgeDocument[]);
    } catch (e) {
      console.error("Error loading documents:", e);
    }
    setLoading(false);
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

  const createDocWithChunks = async (title: string, content: string, sourceType: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.from("knowledge_documents").insert({
      title,
      content: content || null,
      source_type: sourceType,
      status: "processing",
      ...extra,
    } as any).select().single();
    if (error) throw error;

    if (content) {
      const chunks = chunkText(content, 1000);
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
    return data;
  };

  const handleCreate = async () => {
    if (!newDoc.title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    try {
      await createDocWithChunks(newDoc.title, newDoc.content, newDoc.source_type, {
        source_url: newDoc.source_url || null,
      });
      toast.success("Documento adicionado à base de conhecimento");
      setDialogOpen(false);
      setNewDoc({ title: "", content: "", source_type: "text", source_url: "" });
      loadDocuments();
    } catch (e: any) {
      console.error("Error creating document:", e);
      toast.error(e.message || "Erro ao criar documento");
    } finally {
      setSaving(false);
    }
  };

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_FILES = 20;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    const valid: File[] = [];
    const rejected: string[] = [];

    for (const f of newFiles) {
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(`${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        valid.push(f);
      }
    }

    if (rejected.length > 0) {
      toast.error(`Ficheiros rejeitados (>50MB): ${rejected.join(", ")}`);
    }

    setSelectedFiles(prev => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        toast.error(`Máximo de ${MAX_FILES} ficheiros por lote`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ─── File Upload (Batch) ───
  const handleFileUpload = async () => {
    if (selectedFiles.length === 0) { toast.error("Selecione ficheiros"); return; }
    setUploadingFile(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress({ current: i + 1, total: selectedFiles.length });
        try {
          const ext = file.name.split('.').pop() || '';
          const filePath = `${crypto.randomUUID()}.${ext}`;
          const title = file.name.replace(/\.[^.]+$/, '');

          const { error: uploadError } = await supabase.storage
            .from("knowledge-files")
            .upload(filePath, file);
          if (uploadError) throw uploadError;

          let textContent = "";
          if (['txt', 'md', 'csv', 'json', 'xml'].includes(ext.toLowerCase())) {
            textContent = await file.text();
          }

          await createDocWithChunks(title, textContent, "file", { file_path: filePath, file_type: ext });
          successCount++;
        } catch (fileErr) {
          console.error(`Error uploading file ${file.name}:`, fileErr);
          errorCount++;
        }
      }

      if (successCount > 0) toast.success(`${successCount} ficheiro(s) enviado(s) com sucesso`);
      if (errorCount > 0) toast.error(`${errorCount} ficheiro(s) falharam`);

      setDialogOpen(false);
      setSelectedFiles([]);
      setNewDoc({ title: "", content: "", source_type: "text", source_url: "" });
      loadDocuments();
    } catch (e: any) {
      console.error("Error in batch upload:", e);
      toast.error(e.message || "Erro no upload em lote");
    } finally {
      setUploadingFile(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  // ─── Edit Document ───
  const openEdit = (doc: KnowledgeDocument) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content || "");
    setEditSourceUrl(doc.source_url || "");
  };

  const handleEditSave = async () => {
    if (!editDoc) return;
    if (!editTitle.trim()) { toast.error("Título é obrigatório"); return; }
    setEditSaving(true);
    try {
      const contentChanged = editContent !== (editDoc.content || "");
      const updateData: Record<string, any> = { title: editTitle };

      if (editDoc.source_type !== "file") {
        updateData.content = editContent || null;
        updateData.source_url = editSourceUrl || null;
      }

      const { error } = await supabase.from("knowledge_documents").update(updateData as any).eq("id", editDoc.id);
      if (error) throw error;

      // Re-chunk if content changed (not for files)
      if (contentChanged && editDoc.source_type !== "file" && editContent) {
        await supabase.from("knowledge_chunks").delete().eq("document_id", editDoc.id);
        const chunks = chunkText(editContent, 1000);
        const chunkInserts = chunks.map((chunk, i) => ({
          document_id: editDoc.id,
          chunk_index: i,
          content: chunk,
          tokens_count: Math.ceil(chunk.length / 4),
        }));
        await supabase.from("knowledge_chunks").insert(chunkInserts as any);
        await supabase.from("knowledge_documents").update({ chunks_count: chunks.length } as any).eq("id", editDoc.id);
      }

      toast.success("Documento atualizado");
      setEditDoc(null);
      loadDocuments();
    } catch (e: any) {
      console.error("Error editing document:", e);
      toast.error(e.message || "Erro ao editar documento");
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Conversation Training ───
  const previewConversations = async () => {
    if (!convDateFrom || !convDateTo) { toast.error("Selecione as datas"); return; }
    setLoadingConvPreview(true);
    try {
      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id")
        .gte("created_at", convDateFrom)
        .lte("created_at", convDateTo + "T23:59:59");
      if (convErr) throw convErr;

      const convIds = (convs || []).map((c: any) => c.id);
      let msgCount = 0;
      if (convIds.length > 0) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds);
        msgCount = count || 0;
      }
      setConvPreview({ count: convIds.length, messages: msgCount });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingConvPreview(false);
    }
  };

  const importConversations = async () => {
    if (!convDateFrom || !convDateTo) return;
    setSaving(true);
    try {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, contact_name, channel")
        .gte("created_at", convDateFrom)
        .lte("created_at", convDateTo + "T23:59:59");

      if (!convs || convs.length === 0) {
        toast.error("Nenhuma conversa encontrada");
        setSaving(false);
        return;
      }

      const convIds = convs.map((c: any) => c.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, content, direction, sender_name")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true });

      if (!msgs || msgs.length === 0) {
        toast.error("Nenhuma mensagem encontrada");
        setSaving(false);
        return;
      }

      // Group messages by conversation
      const grouped: Record<string, string[]> = {};
      for (const msg of msgs) {
        if (!grouped[msg.conversation_id]) grouped[msg.conversation_id] = [];
        const prefix = msg.direction === "inbound" ? `Cliente` : (msg.sender_name || "Agente");
        grouped[msg.conversation_id].push(`${prefix}: ${msg.content}`);
      }

      // Build training content
      const fullContent = Object.entries(grouped).map(([convId, lines]) => {
        const conv = convs.find((c: any) => c.id === convId);
        return `--- Conversa com ${(conv as any)?.contact_name || "Desconhecido"} (${(conv as any)?.channel || ""}) ---\n${lines.join("\n")}`;
      }).join("\n\n");

      const title = `Conversas ${convDateFrom} a ${convDateTo}`;
      await createDocWithChunks(title, fullContent, "conversation");

      toast.success(`${convs.length} conversas importadas como documento de treino`);
      setConvPreview(null);
      setConvDateFrom("");
      setConvDateTo("");
      setDialogOpen(false);
      loadDocuments();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const doc = documents.find(d => d.id === deleteId);
    if (doc?.file_path) {
      await supabase.storage.from("knowledge-files").remove([doc.file_path]);
    }
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Documento eliminado"); loadDocuments(); }
    setDeleteId(null);
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
    conversation: MessageSquare,
  };

  // Error boundary fallback
  if (componentError) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-4">Ocorreu um erro: {componentError}</p>
        <Button onClick={() => { setComponentError(null); loadDocuments(); }}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Treino & Base de Conhecimento"
        description="Adicione documentos, ficheiros, URLs e conversas para treinar os agentes de IA"
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
      <div className="grid grid-cols-4 gap-4 mb-6">
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
            <Upload className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{documents.filter(d => d.source_type === "file").length}</p>
              <p className="text-xs text-muted-foreground">Ficheiros</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <MessageSquare className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{documents.filter(d => d.source_type === "conversation").length}</p>
              <p className="text-xs text-muted-foreground">Conversas</p>
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
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold">{doc.source_type}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${doc.status === "ready" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{doc.status}</span>
                        <span className="text-[10px] text-muted-foreground">{doc.chunks_count} chunks</span>
                        {doc.file_type && <span className="text-[10px] text-muted-foreground uppercase">{doc.file_type}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(doc)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
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
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
      if (!open) {
          setSelectedFiles([]);
          setConvPreview(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Documento</DialogTitle>
            <DialogDescription>Adicione conteúdo à base de conhecimento dos agentes.</DialogDescription>
          </DialogHeader>

          <Tabs value={newDoc.source_type} onValueChange={(v) => {
            setNewDoc(prev => ({ ...prev, source_type: v }));
            setSelectedFiles([]);
            setConvPreview(null);
          }}>
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="text" className="text-xs"><FileText className="h-3 w-3 mr-1" /> Texto</TabsTrigger>
              <TabsTrigger value="url" className="text-xs"><Globe className="h-3 w-3 mr-1" /> URL</TabsTrigger>
              <TabsTrigger value="file" className="text-xs"><Upload className="h-3 w-3 mr-1" /> Ficheiro</TabsTrigger>
              <TabsTrigger value="faq" className="text-xs"><Brain className="h-3 w-3 mr-1" /> FAQ</TabsTrigger>
              <TabsTrigger value="conversation" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" /> Conversas</TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-3">
              {/* Title (not for conversations or file batch) */}
              {newDoc.source_type !== "conversation" && newDoc.source_type !== "file" && (
                <div>
                  <Label>Título *</Label>
                  <Input value={newDoc.title} onChange={(e) => setNewDoc(prev => ({ ...prev, title: e.target.value }))} placeholder="Ex: Guia de Cidadania Portuguesa" />
                </div>
              )}

              <TabsContent value="text" className="mt-0">
                <Label>Conteúdo</Label>
                <Textarea value={newDoc.content} onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))} rows={8} placeholder="Cole o texto do documento aqui..." />
              </TabsContent>

              <TabsContent value="url" className="mt-0">
                <Label>URL da Página</Label>
                <Input value={newDoc.source_url} onChange={(e) => setNewDoc(prev => ({ ...prev, source_url: e.target.value }))} placeholder="https://example.com/artigo" />
                <p className="text-[11px] text-muted-foreground mt-1">O conteúdo será extraído automaticamente.</p>
              </TabsContent>

              <TabsContent value="file" className="mt-0 space-y-3">
                <div>
                  <Label>Ficheiros (máx. {MAX_FILES}, até 50MB cada)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".txt,.md,.csv,.json,.xml,.pdf,.docx,.doc"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      addFiles(e.dataTransfer.files);
                    }}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {isDragging ? "Solte os ficheiros aqui" : "Arraste ficheiros ou clique para selecionar"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">TXT, MD, CSV, JSON, XML, PDF, DOCX</p>
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-semibold shrink-0">
                            {file.size < 1024 * 1024
                              ? `${(file.size / 1024).toFixed(0)} KB`
                              : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                          </span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); removeFile(idx); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadingFile && uploadProgress.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Enviando {uploadProgress.current}/{uploadProgress.total}...</span>
                      <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                    </div>
                    <Progress value={(uploadProgress.current / uploadProgress.total) * 100} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="faq" className="mt-0">
                <Label>Perguntas e Respostas (formato Q&A)</Label>
                <Textarea value={newDoc.content} onChange={(e) => setNewDoc(prev => ({ ...prev, content: e.target.value }))} rows={8} placeholder={"P: Quanto tempo demora o processo?\nR: O processo geralmente leva 6 a 12 meses.\n\nP: Quais documentos são necessários?\nR: Certidão de nascimento, passaporte..."} />
              </TabsContent>

              <TabsContent value="conversation" className="mt-0 space-y-3">
                <p className="text-sm text-muted-foreground">Importe conversas de um período para treinar a IA com exemplos reais de atendimento.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data Início</Label>
                    <Input type="date" value={convDateFrom} onChange={(e) => setConvDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label>Data Fim</Label>
                    <Input type="date" value={convDateTo} onChange={(e) => setConvDateTo(e.target.value)} />
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={previewConversations} disabled={loadingConvPreview || !convDateFrom || !convDateTo}>
                  {loadingConvPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  Pré-visualizar
                </Button>
                {convPreview && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span><strong>{convPreview.count}</strong> conversas encontradas</span>
                        <span><strong>{convPreview.messages}</strong> mensagens</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            {newDoc.source_type === "file" ? (
              <Button onClick={handleFileUpload} disabled={uploadingFile || selectedFiles.length === 0}>
                {uploadingFile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar {selectedFiles.length || ""} Ficheiro{selectedFiles.length !== 1 ? "s" : ""}
              </Button>
            ) : newDoc.source_type === "conversation" ? (
              <Button onClick={importConversations} disabled={saving || !convPreview || convPreview.count === 0}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Importar {convPreview?.count || 0} Conversas
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Adicionar
              </Button>
            )}
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

      {/* Edit Dialog */}
      <Dialog open={!!editDoc} onOpenChange={() => setEditDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Documento</DialogTitle>
            <DialogDescription>
              {editDoc?.source_type === "file" ? "Para ficheiros, apenas o título pode ser editado." : "Edite o título e conteúdo do documento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            {editDoc?.source_type !== "file" && (
              <>
                <div>
                  <Label>Conteúdo</Label>
                  <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8} />
                </div>
                {editDoc?.source_type === "url" && (
                  <div>
                    <Label>URL</Label>
                    <Input value={editSourceUrl} onChange={(e) => setEditSourceUrl(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
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
