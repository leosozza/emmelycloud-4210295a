import { useState, useEffect, useRef, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Upload, Globe, FileText, Trash2, Search, Brain, BookOpen, Loader2, Eye, MessageSquare, X, Pencil, ChevronDown, FolderOpen, Link } from "lucide-react";
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
  collection_id: string | null;
  collection_name: string | null;
}

interface CollectionGroup {
  collection_id: string;
  collection_name: string;
  documents: KnowledgeDocument[];
  totalChunks: number;
}

export default function TrainingPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "doc" | "collection"; id: string; name?: string } | null>(null);
  const [viewDoc, setViewDoc] = useState<KnowledgeDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Unified training form
  const [trainingTitle, setTrainingTitle] = useState("");
  const [trainingContent, setTrainingContent] = useState("");
  const [trainingUrls, setTrainingUrls] = useState<string[]>([]);
  const [trainingUrlInput, setTrainingUrlInput] = useState("");
  const [trainingFiles, setTrainingFiles] = useState<File[]>([]);

  // Edit state
  const [editCollectionId, setEditCollectionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editUrls, setEditUrls] = useState<string[]>([]);
  const [editUrlInput, setEditUrlInput] = useState("");
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editIsDragging, setEditIsDragging] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  // Existing docs in the collection being edited
  const [editExistingDocs, setEditExistingDocs] = useState<KnowledgeDocument[]>([]);
  const [editDocsToRemove, setEditDocsToRemove] = useState<string[]>([]);

  // Conversation training state (separate tab)
  const [convDialogOpen, setConvDialogOpen] = useState(false);
  const [convDateFrom, setConvDateFrom] = useState("");
  const [convDateTo, setConvDateTo] = useState("");
  const [convPreview, setConvPreview] = useState<{ count: number; messages: number } | null>(null);
  const [loadingConvPreview, setLoadingConvPreview] = useState(false);
  const [bitrixUsers, setBitrixUsers] = useState<Array<{ id: string; name?: string; email?: string }>>([]);
  const [convSelectedUserId, setConvSelectedUserId] = useState<string>("all");
  const [loadingBitrixUsers, setLoadingBitrixUsers] = useState(false);

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_FILES = 20;

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

  // Group documents into collections + standalone
  const { collections, standalone } = useMemo(() => {
    const collMap = new Map<string, CollectionGroup>();
    const solo: KnowledgeDocument[] = [];

    for (const doc of documents) {
      if (doc.collection_id) {
        const existing = collMap.get(doc.collection_id);
        if (existing) {
          existing.documents.push(doc);
          existing.totalChunks += doc.chunks_count || 0;
        } else {
          collMap.set(doc.collection_id, {
            collection_id: doc.collection_id,
            collection_name: doc.collection_name || "Sem nome",
            documents: [doc],
            totalChunks: doc.chunks_count || 0,
          });
        }
      } else {
        solo.push(doc);
      }
    }
    return { collections: Array.from(collMap.values()), standalone: solo };
  }, [documents]);

  // Filter
  const filteredCollections = collections.filter(c =>
    c.collection_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.documents.some(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const filteredStandalone = standalone.filter(d =>
    d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.content || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  // ─── Add files helper ───
  const addFiles = (files: FileList | null, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
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
    if (rejected.length > 0) toast.error(`Ficheiros rejeitados (>50MB): ${rejected.join(", ")}`);
    setter(prev => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        toast.error(`Máximo de ${MAX_FILES} ficheiros por lote`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  // ─── Add URL helper ───
  const addUrl = (url: string, urls: string[], setUrls: React.Dispatch<React.SetStateAction<string[]>>, setInput: React.Dispatch<React.SetStateAction<string>>) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("http")) { toast.error("URL deve começar com http:// ou https://"); return; }
    if (urls.includes(trimmed)) { toast.error("URL já adicionada"); return; }
    setUrls(prev => [...prev, trimmed]);
    setInput("");
  };

  // ─── Create Training (Collection) ───
  const handleCreateTraining = async () => {
    if (!trainingTitle.trim()) { toast.error("Título do treinamento é obrigatório"); return; }
    const hasContent = trainingContent.trim().length > 0;
    const hasFiles = trainingFiles.length > 0;
    const hasUrls = trainingUrls.length > 0;
    if (!hasContent && !hasFiles && !hasUrls) {
      toast.error("Adicione pelo menos um conteúdo (texto, ficheiros ou URLs)");
      return;
    }

    setSaving(true);
    const collectionId = crypto.randomUUID();
    let successCount = 0;
    let totalItems = (hasContent ? 1 : 0) + trainingFiles.length + trainingUrls.length;
    setUploadProgress({ current: 0, total: totalItems });

    try {
      // 1. Text document
      if (hasContent) {
        setUploadProgress(p => ({ ...p, current: p.current + 1 }));
        await createDocWithChunks(trainingTitle, trainingContent, "text", {
          collection_id: collectionId,
          collection_name: trainingTitle,
        });
        successCount++;
      }

      // 2. File documents
      for (let i = 0; i < trainingFiles.length; i++) {
        const file = trainingFiles[i];
        setUploadProgress(p => ({ ...p, current: p.current + 1 }));
        try {
          const ext = file.name.split('.').pop() || '';
          const filePath = `${crypto.randomUUID()}.${ext}`;
          const title = file.name.replace(/\.[^.]+$/, '');

          const { error: uploadError } = await supabase.storage.from("knowledge-files").upload(filePath, file);
          if (uploadError) throw uploadError;

          const isBinaryFile = ['pdf', 'docx', 'doc'].includes(ext.toLowerCase());
          const isTextFile = ['txt', 'md', 'csv', 'json', 'xml'].includes(ext.toLowerCase());

          if (isBinaryFile) {
            // Create doc first, then call edge function to extract text
            const { data: docData, error: docError } = await supabase.from("knowledge_documents").insert({
              title,
              content: null,
              source_type: "file",
              status: "processing",
              file_path: filePath,
              file_type: ext,
              collection_id: collectionId,
              collection_name: trainingTitle,
            } as any).select().single();
            if (docError) throw docError;

            // Call parse-document edge function (non-blocking toast)
            toast.info(`A extrair texto de "${file.name}"...`);
            try {
              const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-document", {
                body: { file_path: filePath, document_id: (docData as any).id },
              });
              if (parseError) {
                console.error(`Parse error for ${file.name}:`, parseError);
                toast.warning(`Não foi possível extrair texto de "${file.name}"`);
              } else {
                toast.success(`"${file.name}": ${parseResult?.chunks || 0} chunks extraídos`);
              }
            } catch (parseErr) {
              console.error(`Parse-document call failed for ${file.name}:`, parseErr);
              // Mark as ready even if parse fails
              await supabase.from("knowledge_documents").update({ status: "ready" } as any).eq("id", (docData as any).id);
            }
            successCount++;
          } else {
            let textContent = "";
            if (isTextFile) {
              try {
                textContent = await file.text();
              } catch (textErr) {
                console.error(`Error reading text from ${file.name}:`, textErr);
              }
            }
            await createDocWithChunks(title, textContent, "file", {
              file_path: filePath,
              file_type: ext,
              collection_id: collectionId,
              collection_name: trainingTitle,
            });
            successCount++;
          }
        } catch (err: any) {
          console.error(`Error uploading ${file.name}:`, err);
          toast.error(`Erro ao enviar "${file.name}": ${err?.message || 'erro desconhecido'}`);
        }
      }

      // 3. URL documents
      for (const url of trainingUrls) {
        setUploadProgress(p => ({ ...p, current: p.current + 1 }));
        try {
          await createDocWithChunks(url, "", "url", {
            source_url: url,
            collection_id: collectionId,
            collection_name: trainingTitle,
          });
          successCount++;
        } catch (err) {
          console.error(`Error adding URL ${url}:`, err);
        }
      }

      if (successCount > 0) {
        toast.success(`Treinamento "${trainingTitle}" criado com ${successCount} documento(s)`);

        // Auto-generate summary from all uploaded content
        if (hasFiles || hasUrls) {
          toast.info("A gerar resumo automático do treinamento...");
          try {
            const { data: summaryResult, error: summaryError } = await supabase.functions.invoke("summarize-training", {
              body: { collection_id: collectionId, collection_name: trainingTitle },
            });
            if (summaryError) {
              console.error("Summary generation error:", summaryError);
              toast.warning("Não foi possível gerar resumo automático");
            } else if (summaryResult?.summary) {
              toast.success("Resumo do treinamento gerado com sucesso!");
            }
          } catch (sumErr) {
            console.error("Summary call failed:", sumErr);
          }
        }
      }
      resetCreateForm();
      setDialogOpen(false);
      loadDocuments();
    } catch (e: any) {
      console.error("Error creating training:", e);
      toast.error(e.message || "Erro ao criar treinamento");
    } finally {
      setSaving(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const resetCreateForm = () => {
    setTrainingTitle("");
    setTrainingContent("");
    setTrainingUrls([]);
    setTrainingUrlInput("");
    setTrainingFiles([]);
  };

  // ─── Edit Collection ───
  const openEditCollection = (group: CollectionGroup) => {
    setEditCollectionId(group.collection_id);
    setEditTitle(group.collection_name);
    setEditExistingDocs(group.documents);
    setEditDocsToRemove([]);
    // Populate text content from text doc if exists
    const textDoc = group.documents.find(d => d.source_type === "text");
    setEditContent(textDoc?.content || "");
    // Populate URLs
    const urlDocs = group.documents.filter(d => d.source_type === "url");
    setEditUrls(urlDocs.map(d => d.source_url || ""));
    setEditUrlInput("");
    setEditNewFiles([]);
  };

  // Edit a standalone (legacy) doc
  const openEditStandalone = (doc: KnowledgeDocument) => {
    // Wrap as a pseudo-collection
    setEditCollectionId(doc.id); // use doc id as pseudo
    setEditTitle(doc.title);
    setEditExistingDocs([doc]);
    setEditDocsToRemove([]);
    setEditContent(doc.content || "");
    const urls = doc.source_url ? [doc.source_url] : [];
    setEditUrls(urls);
    setEditUrlInput("");
    setEditNewFiles([]);
  };

  const handleEditSave = async () => {
    if (!editCollectionId) return;
    if (!editTitle.trim()) { toast.error("Título é obrigatório"); return; }
    setEditSaving(true);

    try {
      const isCollection = editExistingDocs.length > 0 && editExistingDocs[0].collection_id != null;

      if (isCollection) {
        const collId = editExistingDocs[0].collection_id!;

        // Remove docs marked for deletion
        for (const docId of editDocsToRemove) {
          const doc = editExistingDocs.find(d => d.id === docId);
          if (doc?.file_path) {
            await supabase.storage.from("knowledge-files").remove([doc.file_path]);
          }
          await supabase.from("knowledge_chunks").delete().eq("document_id", docId);
          await supabase.from("knowledge_documents").delete().eq("id", docId);
        }

        // Update collection_name on remaining docs
        const remainingIds = editExistingDocs.filter(d => !editDocsToRemove.includes(d.id)).map(d => d.id);
        if (remainingIds.length > 0) {
          await supabase.from("knowledge_documents").update({ collection_name: editTitle } as any).in("id", remainingIds);
        }

        // Update text doc content if changed
        const textDoc = editExistingDocs.find(d => d.source_type === "text" && !editDocsToRemove.includes(d.id));
        if (editContent.trim() && textDoc) {
          const contentChanged = editContent !== (textDoc.content || "");
          if (contentChanged) {
            await supabase.from("knowledge_documents").update({ content: editContent, title: editTitle } as any).eq("id", textDoc.id);
            await supabase.from("knowledge_chunks").delete().eq("document_id", textDoc.id);
            const chunks = chunkText(editContent, 1000);
            const chunkInserts = chunks.map((chunk, i) => ({ document_id: textDoc.id, chunk_index: i, content: chunk, tokens_count: Math.ceil(chunk.length / 4) }));
            await supabase.from("knowledge_chunks").insert(chunkInserts as any);
            await supabase.from("knowledge_documents").update({ chunks_count: chunks.length } as any).eq("id", textDoc.id);
          }
        } else if (editContent.trim() && !textDoc) {
          // Create new text doc in collection
          await createDocWithChunks(editTitle, editContent, "text", { collection_id: collId, collection_name: editTitle });
        }

        // Add new files
        for (const file of editNewFiles) {
          try {
            const ext = file.name.split('.').pop() || '';
            const filePath = `${crypto.randomUUID()}.${ext}`;
            const title = file.name.replace(/\.[^.]+$/, '');
            const { error: uploadError } = await supabase.storage.from("knowledge-files").upload(filePath, file);
            if (uploadError) throw uploadError;

            const isBinaryFile = ['pdf', 'docx', 'doc'].includes(ext.toLowerCase());
            const isTextFile = ['txt', 'md', 'csv', 'json', 'xml'].includes(ext.toLowerCase());

            if (isBinaryFile) {
              const { data: docData, error: docError } = await supabase.from("knowledge_documents").insert({
                title, content: null, source_type: "file", status: "processing",
                file_path: filePath, file_type: ext, collection_id: collId, collection_name: editTitle,
              } as any).select().single();
              if (docError) throw docError;

              try {
                await supabase.functions.invoke("parse-document", {
                  body: { file_path: filePath, document_id: (docData as any).id },
                });
              } catch (parseErr) {
                console.error(`Parse failed for ${file.name}:`, parseErr);
                await supabase.from("knowledge_documents").update({ status: "ready" } as any).eq("id", (docData as any).id);
              }
            } else {
              let textContent = "";
              if (isTextFile) {
                try { textContent = await file.text(); } catch { /* ignore */ }
              }
              await createDocWithChunks(title, textContent, "file", { file_path: filePath, file_type: ext, collection_id: collId, collection_name: editTitle });
            }
          } catch (err) {
            console.error(`Error uploading ${file.name}:`, err);
          }
        }

        // Check for new URLs not already existing
        const existingUrls = editExistingDocs.filter(d => d.source_type === "url" && !editDocsToRemove.includes(d.id)).map(d => d.source_url);
        for (const url of editUrls) {
          if (!existingUrls.includes(url)) {
            await createDocWithChunks(url, "", "url", { source_url: url, collection_id: collId, collection_name: editTitle });
          }
        }

        toast.success("Treinamento atualizado");
      } else {
        // Standalone doc edit (legacy)
        const doc = editExistingDocs[0];
        const updateData: Record<string, any> = { title: editTitle, content: editContent || null };
        if (doc.source_type === "url") updateData.source_url = editUrls[0] || null;

        await supabase.from("knowledge_documents").update(updateData as any).eq("id", doc.id);

        if (editContent !== (doc.content || "") && editContent) {
          await supabase.from("knowledge_chunks").delete().eq("document_id", doc.id);
          const chunks = chunkText(editContent, 1000);
          const chunkInserts = chunks.map((chunk, i) => ({ document_id: doc.id, chunk_index: i, content: chunk, tokens_count: Math.ceil(chunk.length / 4) }));
          await supabase.from("knowledge_chunks").insert(chunkInserts as any);
          await supabase.from("knowledge_documents").update({ chunks_count: chunks.length } as any).eq("id", doc.id);
        }
        toast.success("Documento atualizado");
      }

      setEditCollectionId(null);
      setEditNewFiles([]);
      loadDocuments();
    } catch (e: any) {
      console.error("Error editing:", e);
      toast.error(e.message || "Erro ao editar");
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete ───
  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "collection") {
      const collDocs = documents.filter(d => d.collection_id === deleteTarget.id);
      for (const doc of collDocs) {
        if (doc.file_path) await supabase.storage.from("knowledge-files").remove([doc.file_path]);
        await supabase.from("knowledge_chunks").delete().eq("document_id", doc.id);
        await supabase.from("knowledge_documents").delete().eq("id", doc.id);
      }
      toast.success("Treinamento eliminado");
    } else {
      const doc = documents.find(d => d.id === deleteTarget.id);
      if (doc?.file_path) await supabase.storage.from("knowledge-files").remove([doc.file_path]);
      await supabase.from("knowledge_chunks").delete().eq("document_id", deleteTarget.id);
      await supabase.from("knowledge_documents").delete().eq("id", deleteTarget.id);
      toast.success("Documento eliminado");
    }

    setDeleteTarget(null);
    loadDocuments();
  };

  // ─── Conversation Training ───
  const loadBitrixUsers = async () => {
    if (bitrixUsers.length > 0) return;
    setLoadingBitrixUsers(true);
    try {
      const { data, error } = await supabase.functions.invoke("bitrix24-fetch-users");
      if (error) throw error;
      setBitrixUsers((data as any)?.users || []);
    } catch (e: any) {
      console.error("Error loading Bitrix users:", e);
      toast.error("Não foi possível carregar utilizadores Bitrix24");
    } finally {
      setLoadingBitrixUsers(false);
    }
  };

  useEffect(() => { if (convDialogOpen) loadBitrixUsers(); }, [convDialogOpen]);

  // Returns conversation IDs filtered by date and (optionally) Bitrix user
  const fetchFilteredConversationIds = async (): Promise<string[] | null> => {
    let allowedConvIds: Set<string> | null = null;
    if (convSelectedUserId && convSelectedUserId !== "all") {
      const { data, error } = await supabase.functions.invoke("bitrix24-deals-by-user", {
        body: { user_id: convSelectedUserId, date_from: convDateFrom, date_to: convDateTo + "T23:59:59" },
      });
      if (error) throw error;
      const dealIds: string[] = (data as any)?.deal_ids || [];
      if (dealIds.length === 0) return [];
      // Map deals -> leads -> conversations
      const { data: leadsRows } = await supabase
        .from("leads").select("conversation_id")
        .in("bitrix24_id", dealIds).not("conversation_id", "is", null);
      const ids = (leadsRows || []).map((l: any) => l.conversation_id).filter(Boolean);
      if (ids.length === 0) return [];
      allowedConvIds = new Set(ids);
    }
    const { data: convs, error } = await supabase
      .from("conversations").select("id")
      .gte("created_at", convDateFrom).lte("created_at", convDateTo + "T23:59:59");
    if (error) throw error;
    let convIds = (convs || []).map((c: any) => c.id);
    if (allowedConvIds) convIds = convIds.filter(id => allowedConvIds!.has(id));
    return convIds;
  };

  const previewConversations = async () => {
    if (!convDateFrom || !convDateTo) { toast.error("Selecione as datas"); return; }
    setLoadingConvPreview(true);
    try {
      const convIds = await fetchFilteredConversationIds();
      if (!convIds) return;
      let msgCount = 0;
      if (convIds.length > 0) {
        const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).in("conversation_id", convIds);
        msgCount = count || 0;
      }
      setConvPreview({ count: convIds.length, messages: msgCount });
    } catch (e: any) { toast.error(e.message); }
    finally { setLoadingConvPreview(false); }
  };

  const importConversations = async () => {
    if (!convDateFrom || !convDateTo) return;
    setSaving(true);
    try {
      const convIds = await fetchFilteredConversationIds();
      if (!convIds || convIds.length === 0) { toast.error("Nenhuma conversa encontrada"); setSaving(false); return; }
      const { data: convs } = await supabase.from("conversations")
        .select("id, contact_name, channel").in("id", convIds);
      const { data: msgs } = await supabase.from("messages")
        .select("conversation_id, content, direction, sender_name")
        .in("conversation_id", convIds).order("created_at", { ascending: true });
      if (!msgs || msgs.length === 0) { toast.error("Nenhuma mensagem encontrada"); setSaving(false); return; }

      const grouped: Record<string, string[]> = {};
      for (const msg of msgs) {
        if (!grouped[msg.conversation_id]) grouped[msg.conversation_id] = [];
        const prefix = msg.direction === "inbound" ? "Cliente" : (msg.sender_name || "Agente");
        grouped[msg.conversation_id].push(`${prefix}: ${msg.content}`);
      }

      const fullContent = Object.entries(grouped).map(([convId, lines]) => {
        const conv = (convs || []).find((c: any) => c.id === convId);
        return `--- Conversa com ${(conv as any)?.contact_name || "Desconhecido"} (${(conv as any)?.channel || ""}) ---\n${lines.join("\n")}`;
      }).join("\n\n");

      const userLabel = convSelectedUserId !== "all"
        ? ` — ${bitrixUsers.find(u => u.id === convSelectedUserId)?.name || "user"}`.trim()
        : "";
      const title = `Conversas ${convDateFrom} a ${convDateTo}${userLabel}`;
      await createDocWithChunks(title, fullContent, "conversation");
      toast.success(`${convIds.length} conversas importadas como documento de treino`);
      setConvPreview(null); setConvDateFrom(""); setConvDateTo(""); setConvSelectedUserId("all"); setConvDialogOpen(false);
      loadDocuments();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const sourceIcons: Record<string, any> = {
    text: FileText, url: Globe, file: Upload, faq: Brain, conversation: MessageSquare,
  };

  return (
    <div>
      <PageHeader
        title="Treino & Base de Conhecimento"
        description="Crie treinamentos completos com texto, ficheiros e URLs"
      />

      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Pesquisar treinamentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConvDialogOpen(true)}>
            <MessageSquare className="h-4 w-4 mr-2" /> Importar Conversas
          </Button>
          <Button onClick={() => { resetCreateForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Treinamento
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FolderOpen className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{collections.length}</p>
              <p className="text-xs text-muted-foreground">Treinamentos</p>
            </div>
          </CardContent>
        </Card>
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
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filteredCollections.length === 0 && filteredStandalone.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum treinamento na base de conhecimento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Collection cards */}
          {filteredCollections.map((group) => (
            <CollectionCard
              key={group.collection_id}
              group={group}
              sourceIcons={sourceIcons}
              onEdit={() => openEditCollection(group)}
              onDelete={() => setDeleteTarget({ type: "collection", id: group.collection_id, name: group.collection_name })}
              onViewDoc={setViewDoc}
              onDeleteDoc={(id) => setDeleteTarget({ type: "doc", id })}
            />
          ))}

          {/* Standalone (legacy) docs */}
          {filteredStandalone.map((doc) => {
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
                        <span className="text-[10px] text-muted-foreground">{doc.chunks_count} chunks</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditStandalone(doc)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDoc(doc)}><Eye className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget({ type: "doc", id: doc.id })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Create Training Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Treinamento</DialogTitle>
            <DialogDescription>Crie um treinamento completo com texto, ficheiros e URLs.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <Label>Título do Treinamento *</Label>
              <Input value={trainingTitle} onChange={(e) => setTrainingTitle(e.target.value)} placeholder="Ex: Treinamento de Vendas" />
            </div>

            {/* Text */}
            <div>
              <Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Texto (opcional)</Label>
              <Textarea value={trainingContent} onChange={(e) => setTrainingContent(e.target.value)} rows={6} placeholder="Cole ou escreva o conteúdo do treinamento..." />
            </div>

            {/* Files */}
            <div>
              <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Ficheiros (opcional, máx. {MAX_FILES})</Label>
              <input ref={fileInputRef} type="file" multiple className="hidden" accept=".txt,.md,.csv,.json,.xml,.pdf,.docx,.doc" onChange={(e) => { addFiles(e.target.files, setTrainingFiles); e.target.value = ""; }} />
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files, setTrainingFiles); }}
              >
                <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-sm text-muted-foreground">{isDragging ? "Solte os ficheiros aqui" : "Arraste ou clique para selecionar"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">TXT, MD, CSV, JSON, XML, PDF, DOCX (até 50MB cada)</p>
              </div>
              {trainingFiles.length > 0 && (
                <div className="space-y-1 mt-2 max-h-36 overflow-y-auto">
                  {trainingFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); setTrainingFiles(prev => prev.filter((_, i) => i !== idx)); }}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* URLs */}
            <div>
              <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> URLs (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  value={trainingUrlInput}
                  onChange={(e) => setTrainingUrlInput(e.target.value)}
                  placeholder="https://example.com/artigo"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(trainingUrlInput, trainingUrls, setTrainingUrls, setTrainingUrlInput); } }}
                />
                <Button variant="outline" size="sm" onClick={() => addUrl(trainingUrlInput, trainingUrls, setTrainingUrls, setTrainingUrlInput)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {trainingUrls.length > 0 && (
                <div className="space-y-1 mt-2">
                  {trainingUrls.map((url, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{url}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setTrainingUrls(prev => prev.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Progress */}
            {saving && uploadProgress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processando {uploadProgress.current}/{uploadProgress.total}...</span>
                  <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                </div>
                <Progress value={(uploadProgress.current / uploadProgress.total) * 100} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateTraining} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Treinamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={!!editCollectionId} onOpenChange={(open) => { if (!open) { setEditCollectionId(null); setEditNewFiles([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Treinamento</DialogTitle>
            <DialogDescription>Altere o conteúdo, adicione ou remova itens.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>

            {/* Existing docs list */}
            {editExistingDocs.filter(d => !editDocsToRemove.includes(d.id)).length > 0 && (
              <div>
                <Label className="mb-1.5 block">Documentos existentes</Label>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {editExistingDocs.filter(d => !editDocsToRemove.includes(d.id)).map(doc => {
                    const Icon = sourceIcons[doc.source_type] || FileText;
                    return (
                      <div key={doc.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{doc.title}</span>
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold">{doc.source_type}</span>
                        </div>
                        {doc.source_type !== "text" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => setEditDocsToRemove(prev => [...prev, doc.id])}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Text content */}
            <div>
              <Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Texto</Label>
              <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} placeholder="Conteúdo de texto..." />
            </div>

            {/* Add more files */}
            <div>
              <Label className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Adicionar Ficheiros</Label>
              <input ref={editFileInputRef} type="file" multiple className="hidden" accept=".txt,.md,.csv,.json,.xml,.pdf,.docx,.doc" onChange={(e) => { addFiles(e.target.files, setEditNewFiles); e.target.value = ""; }} />
              <div
                className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${editIsDragging ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onClick={() => editFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setEditIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setEditIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setEditIsDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setEditIsDragging(false); addFiles(e.dataTransfer.files, setEditNewFiles); }}
              >
                <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">{editIsDragging ? "Solte aqui" : "Arraste ou clique"}</p>
              </div>
              {editNewFiles.length > 0 && (
                <div className="space-y-1 mt-2 max-h-28 overflow-y-auto">
                  {editNewFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditNewFiles(prev => prev.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* URLs */}
            <div>
              <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> URLs</Label>
              <div className="flex gap-2">
                <Input value={editUrlInput} onChange={(e) => setEditUrlInput(e.target.value)} placeholder="https://..." onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(editUrlInput, editUrls, setEditUrls, setEditUrlInput); } }} />
                <Button variant="outline" size="sm" onClick={() => addUrl(editUrlInput, editUrls, setEditUrls, setEditUrlInput)}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              {editUrls.length > 0 && (
                <div className="space-y-1 mt-2">
                  {editUrls.map((url, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{url}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditUrls(prev => prev.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditCollectionId(null); setEditNewFiles([]); }}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Conversation Import Dialog ─── */}
      <Dialog open={convDialogOpen} onOpenChange={setConvDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Conversas</DialogTitle>
            <DialogDescription>Importe conversas de um período para treinar a IA.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Utilizador Bitrix24 (responsável)</Label>
              <Select value={convSelectedUserId} onValueChange={setConvSelectedUserId} disabled={loadingBitrixUsers}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={loadingBitrixUsers ? "A carregar..." : "Todos"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os utilizadores</SelectItem>
                  {bitrixUsers.map(u => (
                    <SelectItem key={u.ID} value={u.ID}>
                      {[u.NAME, u.LAST_NAME].filter(Boolean).join(" ") || u.EMAIL || `User ${u.ID}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Filtra por conversas vinculadas a leads/deals deste responsável.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data Início</Label><Input type="date" value={convDateFrom} onChange={(e) => setConvDateFrom(e.target.value)} /></div>
              <div><Label>Data Fim</Label><Input type="date" value={convDateTo} onChange={(e) => setConvDateTo(e.target.value)} /></div>
            </div>
            <Button variant="outline" className="w-full" onClick={previewConversations} disabled={loadingConvPreview || !convDateFrom || !convDateTo}>
              {loadingConvPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Pré-visualizar
            </Button>
            {convPreview && (
              <Card><CardContent className="p-3"><div className="flex items-center justify-between text-sm"><span><strong>{convPreview.count}</strong> conversas</span><span><strong>{convPreview.messages}</strong> mensagens</span></div></CardContent></Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvDialogOpen(false)}>Cancelar</Button>
            <Button onClick={importConversations} disabled={saving || !convPreview || convPreview.count === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {convPreview?.count || 0} Conversas
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
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.type === "collection" ? "Eliminar treinamento?" : "Eliminar documento?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "collection"
                ? `Todos os documentos e ficheiros do treinamento "${deleteTarget.name}" serão eliminados permanentemente.`
                : "O documento e todos os seus chunks serão eliminados da base de conhecimento."}
            </AlertDialogDescription>
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

// ─── Collection Card Component ───
function CollectionCard({ group, sourceIcons, onEdit, onDelete, onViewDoc, onDeleteDoc }: {
  group: CollectionGroup;
  sourceIcons: Record<string, any>;
  onEdit: () => void;
  onDelete: () => void;
  onViewDoc: (doc: KnowledgeDocument) => void;
  onDeleteDoc: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fileCount = group.documents.filter(d => d.source_type === "file").length;
  const urlCount = group.documents.filter(d => d.source_type === "url").length;
  const hasText = group.documents.some(d => d.source_type === "text");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="hover:shadow-sm transition-shadow">
        <CardContent className="p-0">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 cursor-pointer">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{group.collection_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{group.documents.length} doc(s)</span>
                    <span className="text-[10px] text-muted-foreground">{group.totalChunks} chunks</span>
                    {hasText && <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-semibold">Texto</span>}
                    {fileCount > 0 && <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-semibold">{fileCount} ficheiro(s)</span>}
                    {urlCount > 0 && <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-semibold">{urlCount} URL(s)</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 className="h-3 w-3" /></Button>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t px-4 pb-3 pt-2 space-y-1">
              {group.documents.map(doc => {
                const Icon = sourceIcons[doc.source_type] || FileText;
                return (
                  <div key={doc.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/50 rounded-md text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{doc.title}</span>
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold">{doc.source_type}</span>
                      <span className="text-[10px] text-muted-foreground">{doc.chunks_count} chunks</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onViewDoc(doc)}><Eye className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDeleteDoc(doc.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
