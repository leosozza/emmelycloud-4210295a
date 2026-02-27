import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, RefreshCw, ArrowRight, Save, Search, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Supabase table schemas (from types.ts) ──
const SUPABASE_TABLES: Record<string, { label: string; columns: { key: string; type: string }[] }> = {
  leads: {
    label: "Leads",
    columns: [
      { key: "name", type: "text" },
      { key: "email", type: "text" },
      { key: "phone", type: "text" },
      { key: "country", type: "text" },
      { key: "origin", type: "enum" },
      { key: "legal_area", type: "enum" },
      { key: "urgency", type: "text" },
      { key: "notes", type: "text" },
      { key: "ai_score", type: "numeric" },
      { key: "ai_viability", type: "text" },
      { key: "funnel_stage", type: "enum" },
    ],
  },
  cases: {
    label: "Casos",
    columns: [
      { key: "title", type: "text" },
      { key: "description", type: "text" },
      { key: "legal_area", type: "enum" },
      { key: "status", type: "enum" },
      { key: "viability", type: "text" },
      { key: "internal_notes", type: "text" },
    ],
  },
  clients: {
    label: "Clientes",
    columns: [
      { key: "name", type: "text" },
      { key: "document_type", type: "text" },
      { key: "document_number", type: "text" },
      { key: "nationality", type: "text" },
      { key: "birth_date", type: "date" },
      { key: "address", type: "text" },
      { key: "postal_code", type: "text" },
      { key: "freguesia", type: "text" },
      { key: "concelho", type: "text" },
      { key: "distrito", type: "text" },
      { key: "country", type: "text" },
      { key: "nib", type: "text" },
      { key: "notes", type: "text" },
    ],
  },
  proposals: {
    label: "Propostas",
    columns: [
      { key: "title", type: "text" },
      { key: "value", type: "numeric" },
      { key: "payment_type", type: "enum" },
      { key: "installments", type: "integer" },
      { key: "conditions", type: "text" },
      { key: "status", type: "enum" },
    ],
  },
  contracts: {
    label: "Contratos",
    columns: [
      { key: "status", type: "enum" },
      { key: "starts_at", type: "timestamp" },
      { key: "expires_at", type: "timestamp" },
      { key: "file_url", type: "text" },
      { key: "notes", type: "text" },
    ],
  },
  conversations: {
    label: "Conversas",
    columns: [
      { key: "contact_name", type: "text" },
      { key: "contact_phone", type: "text" },
      { key: "contact_email", type: "text" },
      { key: "contact_instagram", type: "text" },
      { key: "channel", type: "enum" },
      { key: "status", type: "enum" },
      { key: "department", type: "text" },
    ],
  },
};

interface BitrixField {
  key: string;
  title: string;
  type: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isMultiple: boolean;
}

interface FieldMapping {
  id?: string;
  bitrix_entity: string;
  bitrix_field_key: string;
  bitrix_field_title: string;
  supabase_table: string;
  supabase_column: string;
  sync_direction: string;
  is_active: boolean;
  isNew?: boolean;
}

interface FieldMappingManagerProps {
  integrationId?: string;
  compact?: boolean;
}

export default function FieldMappingManager({ integrationId, compact }: FieldMappingManagerProps) {
  const [bitrixEntity, setBitrixEntity] = useState<"lead" | "deal">("lead");
  const [bitrixFields, setBitrixFields] = useState<BitrixField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // ── Fetch Bitrix fields ──
  const fetchBitrixFields = useCallback(async (entity: string) => {
    setLoadingFields(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/bitrix24-fields?entity=${entity}`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}`,
          },
        }
      );
      const data = await res.json();
      setBitrixFields(data.fields || []);
    } catch (e) {
      console.error("Error fetching Bitrix fields:", e);
      setBitrixFields([]);
    } finally {
      setLoadingFields(false);
    }
  }, []);

  // ── Fetch saved mappings ──
  const fetchMappings = useCallback(async () => {
    setLoadingMappings(true);
    try {
      let query = supabase
        .from("bitrix24_field_mappings" as any)
        .select("*")
        .eq("bitrix_entity", bitrixEntity)
        .order("created_at", { ascending: true });

      if (integrationId) {
        query = query.eq("integration_id", integrationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMappings((data as any[] || []).map((m: any) => ({ ...m, isNew: false })));
    } catch (e) {
      console.error("Error fetching mappings:", e);
      setMappings([]);
    } finally {
      setLoadingMappings(false);
    }
  }, [bitrixEntity, integrationId]);

  useEffect(() => {
    fetchBitrixFields(bitrixEntity);
    fetchMappings();
  }, [bitrixEntity, fetchBitrixFields, fetchMappings]);

  // ── Filtered bitrix fields ──
  const filteredBitrixFields = useMemo(() => {
    if (!search) return bitrixFields;
    const q = search.toLowerCase();
    return bitrixFields.filter(
      (f) => f.key.toLowerCase().includes(q) || f.title.toLowerCase().includes(q)
    );
  }, [bitrixFields, search]);

  // ── Add mapping ──
  const addMapping = (bitrixField: BitrixField) => {
    // Default supabase table based on entity
    const defaultTable = bitrixEntity === "lead" ? "leads" : "cases";
    const exists = mappings.find(
      (m) => m.bitrix_field_key === bitrixField.key && m.supabase_table === defaultTable
    );
    if (exists) {
      toast.info("Este campo já está mapeado");
      return;
    }
    setMappings((prev) => [
      ...prev,
      {
        bitrix_entity: bitrixEntity,
        bitrix_field_key: bitrixField.key,
        bitrix_field_title: bitrixField.title,
        supabase_table: defaultTable,
        supabase_column: "",
        sync_direction: "bitrix_to_supabase",
        is_active: true,
        isNew: true,
      },
    ]);
  };

  // ── Update mapping field ──
  const updateMapping = (index: number, field: Partial<FieldMapping>) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, ...field } : m)));
  };

  // ── Remove mapping ──
  const removeMapping = async (index: number) => {
    const mapping = mappings[index];
    if (mapping.id) {
      try {
        await (supabase.from("bitrix24_field_mappings" as any) as any).delete().eq("id", mapping.id);
      } catch {}
    }
    setMappings((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Save all mappings ──
  const saveAll = async () => {
    setSaving(true);
    try {
      for (const m of mappings) {
        if (!m.supabase_column) continue;
        const payload: any = {
          integration_id: integrationId || null,
          bitrix_entity: m.bitrix_entity,
          bitrix_field_key: m.bitrix_field_key,
          bitrix_field_title: m.bitrix_field_title,
          supabase_table: m.supabase_table,
          supabase_column: m.supabase_column,
          sync_direction: m.sync_direction,
          is_active: m.is_active,
        };

        if (m.id) {
          await (supabase.from("bitrix24_field_mappings" as any) as any)
            .update(payload)
            .eq("id", m.id);
        } else {
          await (supabase.from("bitrix24_field_mappings" as any) as any)
            .insert(payload);
        }
      }
      toast.success("Mapeamentos guardados com sucesso");
      fetchMappings();
    } catch (e) {
      toast.error("Erro ao guardar mapeamentos");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Mapped field keys (to highlight in list) ──
  const mappedKeys = new Set(mappings.map((m) => m.bitrix_field_key));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Mapeamento de Campos</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select value={bitrixEntity} onValueChange={(v) => setBitrixEntity(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead (Bitrix)</SelectItem>
              <SelectItem value="deal">Deal (Bitrix)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fetchBitrixFields(bitrixEntity)} disabled={loadingFields}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingFields ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving || mappings.length === 0}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className={`grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
        {/* ── Left: Bitrix Fields ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Campos Bitrix24 — {bitrixEntity === "lead" ? "crm.lead.fields" : "crm.deal.fields"}
            </CardTitle>
            <CardDescription className="text-xs">
              {bitrixFields.length} campos encontrados. Clique "+" para mapear.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-7 text-xs"
                placeholder="Buscar campo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="h-[350px]">
              {loadingFields ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando campos do Bitrix...
                </div>
              ) : filteredBitrixFields.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {bitrixFields.length === 0 ? "Nenhuma integração ativa ou sem campos" : "Nenhum resultado"}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredBitrixFields.map((f) => (
                    <div
                      key={f.key}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-accent/50 group ${
                        mappedKeys.has(f.key) ? "bg-primary/5 border-l-2 border-primary" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{f.title}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{f.key}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className="text-[9px] h-4 px-1">{f.type}</Badge>
                        {f.isRequired && <Badge variant="destructive" className="text-[9px] h-4 px-1">REQ</Badge>}
                        {mappedKeys.has(f.key) ? (
                          <Badge className="text-[9px] h-4 px-1 bg-primary/20 text-primary">Mapeado</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100"
                            onClick={() => addMapping(f)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ── Right: Mapping Table ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Mapeamentos Configurados</CardTitle>
            <CardDescription className="text-xs">
              {mappings.length} mapeamento(s). Selecione tabela e coluna do Supabase para cada campo.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[350px]">
              {loadingMappings ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando mapeamentos...
                </div>
              ) : mappings.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum mapeamento. Clique "+" nos campos Bitrix para adicionar.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1">Campo Bitrix</TableHead>
                      <TableHead className="text-[10px] py-1 w-5"><ArrowRight className="h-3 w-3" /></TableHead>
                      <TableHead className="text-[10px] py-1">Tabela</TableHead>
                      <TableHead className="text-[10px] py-1">Coluna</TableHead>
                      <TableHead className="text-[10px] py-1">Dir.</TableHead>
                      <TableHead className="text-[10px] py-1 w-8">On</TableHead>
                      <TableHead className="text-[10px] py-1 w-6"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((m, i) => (
                      <TableRow key={m.id || `new-${i}`}>
                        <TableCell className="py-1 text-[10px]">
                          <div>
                            <span className="font-medium">{m.bitrix_field_title}</span>
                            <span className="block text-muted-foreground font-mono text-[9px]">{m.bitrix_field_key}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </TableCell>
                        <TableCell className="py-1">
                          <Select
                            value={m.supabase_table}
                            onValueChange={(v) => updateMapping(i, { supabase_table: v, supabase_column: "" })}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(SUPABASE_TABLES).map(([k, v]) => (
                                <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1">
                          <Select
                            value={m.supabase_column}
                            onValueChange={(v) => updateMapping(i, { supabase_column: v })}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[110px]">
                              <SelectValue placeholder="Coluna..." />
                            </SelectTrigger>
                            <SelectContent>
                              {SUPABASE_TABLES[m.supabase_table]?.columns.map((col) => (
                                <SelectItem key={col.key} value={col.key} className="text-xs">
                                  {col.key} <span className="text-muted-foreground ml-1">({col.type})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1">
                          <Select
                            value={m.sync_direction}
                            onValueChange={(v) => updateMapping(i, { sync_direction: v })}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bitrix_to_supabase" className="text-xs">B→S</SelectItem>
                              <SelectItem value="supabase_to_bitrix" className="text-xs">S→B</SelectItem>
                              <SelectItem value="bidirectional" className="text-xs">⇆</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1">
                          <Switch
                            checked={m.is_active}
                            onCheckedChange={(v) => updateMapping(i, { is_active: v })}
                            className="scale-75"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-destructive"
                            onClick={() => removeMapping(i)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
