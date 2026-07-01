import { useState, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Trash2, RefreshCw, ArrowRight, Save, Search, Link2, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Supabase table schemas ──
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
  financial_records: {
    label: "Faturas / Financeiro",
    columns: [
      { key: "installment_value", type: "numeric" },
      { key: "total_value", type: "numeric" },
      { key: "due_date", type: "date" },
      { key: "paid_at", type: "timestamp" },
      { key: "status", type: "enum" },
    ],
  },
};

// Mapeamentos criados/mantidos automaticamente pela aplicação
// (campos UF_CRM_EMMELY_* que o sistema cria via bitrix24-ensure-asaas-fields
// e bitrix24-spa-create-fields). São exibidos como pré-mapeados e não editáveis.
const SYSTEM_MAPPINGS: Record<string, Record<string, { bitrixField: string; direction: string }>> = {
  // entity "deal" -> tabelas
  deal: {
    // proposals
    "proposals::bitrix_payment_id": { bitrixField: "UF_CRM_EMMELY_ASAAS_PAYMENT_ID", direction: "supabase_to_bitrix" },
    "proposals::asaas_subscription_id": { bitrixField: "UF_CRM_EMMELY_ASAAS_SUB_ID", direction: "supabase_to_bitrix" },
    "proposals::asaas_customer_id": { bitrixField: "UF_CRM_EMMELY_ASAAS_CUSTOMER_ID", direction: "supabase_to_bitrix" },
    // financial_records / faturas
    "financial_records::nfse_url": { bitrixField: "UF_CRM_EMMELY_NFSE_URL", direction: "supabase_to_bitrix" },
    "financial_records::nfse_number": { bitrixField: "UF_CRM_EMMELY_NFSE_NUMBER", direction: "supabase_to_bitrix" },
    "financial_records::nfse_status": { bitrixField: "UF_CRM_EMMELY_NFSE_STATUS", direction: "supabase_to_bitrix" },
  },
  // lead
  lead: {},
};

const SYSTEM_FIELD_PREFIX = "UF_CRM_EMMELY_";

const isEmmelySystemBitrixField = (fieldKey: string) =>
  fieldKey.toUpperCase().startsWith(SYSTEM_FIELD_PREFIX);

const toSystemSupabaseColumn = (fieldKey: string) => {
  const code = fieldKey.toUpperCase().replace(SYSTEM_FIELD_PREFIX, "").toLowerCase();
  return `sistema.${code}`;
};

interface BitrixField {
  key: string;
  title: string;
  type: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isMultiple: boolean;
}

interface RowMapping {
  supabaseColumn: string;
  supabaseType: string;
  bitrixFieldKey: string; // "" = not mapped
  syncDirection: string;
  isActive: boolean;
  dbId?: string; // existing DB row id
  isSystem?: boolean; // mapeamento criado pela aplicação
}

interface FieldMappingManagerProps {
  integrationId?: string;
  compact?: boolean;
}

export default function FieldMappingManager({ integrationId, compact, memberId }: FieldMappingManagerProps & { memberId?: string }) {
  const [bitrixEntity, setBitrixEntity] = useState<"lead" | "deal">("deal");
  const [supabaseTable, setSupabaseTable] = useState("financial_records");
  const [bitrixFields, setBitrixFields] = useState<BitrixField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [rows, setRows] = useState<RowMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showOnlyMapped, setShowOnlyMapped] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // ── Fetch Bitrix fields ──
  const fetchBitrixFields = useCallback(async (entity: string) => {
    setLoadingFields(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const queryParams = new URLSearchParams({ entity });
      if (memberId) queryParams.set("member_id", memberId);
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/bitrix24-fields?${queryParams}`,
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

  // ── Build rows from Supabase columns + saved mappings ──
  const buildRows = useCallback(async () => {
    setLoadingMappings(true);
    try {
      let query = supabase
        .from("bitrix24_field_mappings" as any)
        .select("*")
        .eq("bitrix_entity", bitrixEntity)
        .eq("supabase_table", supabaseTable)
        .order("created_at", { ascending: true });

      if (integrationId) {
        query = query.eq("integration_id", integrationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const savedMappings = (data as any[] || []);
      const savedByColumn = new Map<string, any>();
      for (const m of savedMappings) {
        savedByColumn.set(m.supabase_column, m);
      }

      const tableColumns = SUPABASE_TABLES[supabaseTable]?.columns || [];
      const systemForEntity = SYSTEM_MAPPINGS[bitrixEntity] || {};
      const systemColumns = new Set(
        Object.keys(systemForEntity)
          .filter((k) => k.startsWith(`${supabaseTable}::`))
          .map((k) => k.split("::")[1]),
      );
      const renderedSystemBitrixFields = new Set<string>();

      const baseRows: RowMapping[] = tableColumns.map((col) => {
        const saved = savedByColumn.get(col.key);
        const sysKey = `${supabaseTable}::${col.key}`;
        const sys = systemForEntity[sysKey];
        if (sys) {
          renderedSystemBitrixFields.add(sys.bitrixField.toUpperCase());
          return {
            supabaseColumn: col.key,
            supabaseType: col.type,
            bitrixFieldKey: sys.bitrixField,
            syncDirection: sys.direction,
            isActive: true,
            isSystem: true,
          };
        }
        return {
          supabaseColumn: col.key,
          supabaseType: col.type,
          bitrixFieldKey: saved?.bitrix_field_key || "",
          syncDirection: saved?.sync_direction || "bitrix_to_supabase",
          isActive: saved?.is_active ?? true,
          dbId: saved?.id,
        };
      });

      // Acrescenta rows de sistema que não existem nas columns padrão
      const extraSystemRows: RowMapping[] = Array.from(systemColumns)
        .filter((col) => !tableColumns.some((c) => c.key === col))
        .map((col) => {
          const sys = systemForEntity[`${supabaseTable}::${col}`];
          renderedSystemBitrixFields.add(sys.bitrixField.toUpperCase());
          return {
            supabaseColumn: col,
            supabaseType: "auto",
            bitrixFieldKey: sys.bitrixField,
            syncDirection: sys.direction,
            isActive: true,
            isSystem: true,
          };
        });

      // Campos UF_CRM_EMMELY_* são criados e atualizados diretamente pela aplicação no Bitrix.
      // Eles não dependem da tabela bitrix24_field_mappings, então devem aparecer como
      // mapeados automaticamente sempre que existirem no CRM selecionado.
      const discoveredSystemRows: RowMapping[] = bitrixFields
        .filter((field) => isEmmelySystemBitrixField(field.key))
        .filter((field) => !renderedSystemBitrixFields.has(field.key.toUpperCase()))
        .map((field) => ({
          supabaseColumn: toSystemSupabaseColumn(field.key),
          supabaseType: field.type || "auto",
          bitrixFieldKey: field.key,
          syncDirection: "supabase_to_bitrix",
          isActive: true,
          isSystem: true,
        }));

      setRows([...extraSystemRows, ...discoveredSystemRows, ...baseRows]);
    } catch (e) {
      console.error("Error building rows:", e);
      setRows([]);
    } finally {
      setLoadingMappings(false);
    }
  }, [bitrixEntity, supabaseTable, integrationId, bitrixFields]);

  useEffect(() => {
    fetchBitrixFields(bitrixEntity);
  }, [bitrixEntity, fetchBitrixFields]);

  useEffect(() => {
    buildRows();
  }, [buildRows]);

  // ── Filtered rows ──
  const filteredRows = useMemo(() => {
    let result = rows;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.supabaseColumn.toLowerCase().includes(q));
    }
    if (showOnlyMapped) {
      result = result.filter((r) => r.bitrixFieldKey !== "");
    }
    return result;
  }, [rows, search, showOnlyMapped]);

  // ── Stats ──
  const totalFields = rows.length;
  const mappedCount = rows.filter((r) => r.bitrixFieldKey !== "").length;

  // ── Update a row ──
  const updateRow = (colKey: string, patch: Partial<RowMapping>) => {
    setRows((prev) =>
      prev.map((r) => (r.supabaseColumn === colKey ? { ...r, ...patch } : r))
    );
  };

  // ── Clear mapping for a row ──
  const clearMapping = async (colKey: string) => {
    const row = rows.find((r) => r.supabaseColumn === colKey);
    if (row?.dbId) {
      try {
        await (supabase.from("bitrix24_field_mappings" as any) as any).delete().eq("id", row.dbId);
      } catch {}
    }
    updateRow(colKey, { bitrixFieldKey: "", dbId: undefined });
  };

  // ── Save all ──
  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        if (r.isSystem) continue; // mapeamentos automáticos não vão para a tabela
        if (!r.bitrixFieldKey) continue;
        const bitrixField = bitrixFields.find((f) => f.key === r.bitrixFieldKey);
        const payload: any = {
          integration_id: integrationId || null,
          bitrix_entity: bitrixEntity,
          bitrix_field_key: r.bitrixFieldKey,
          bitrix_field_title: bitrixField?.title || r.bitrixFieldKey,
          supabase_table: supabaseTable,
          supabase_column: r.supabaseColumn,
          sync_direction: r.syncDirection,
          is_active: r.isActive,
        };

        if (r.dbId) {
          await (supabase.from("bitrix24_field_mappings" as any) as any)
            .update(payload)
            .eq("id", r.dbId);
        } else {
          await (supabase.from("bitrix24_field_mappings" as any) as any)
            .insert(payload);
        }
      }
      toast.success("Mapeamentos guardados com sucesso");
      buildRows();
    } catch (e) {
      toast.error("Erro ao guardar mapeamentos");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Select all toggle ──
  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedRows.has(r.supabaseColumn));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((r) => r.supabaseColumn)));
    }
  };

  const getBitrixFieldLabel = (key: string) => {
    const f = bitrixFields.find((b) => b.key === key);
    if (!f) return key;
    return `${f.title} — ${f.key}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold text-base">Mapeamento de Campos</h3>
          <p className="text-xs text-muted-foreground">Configure como os campos são sincronizados entre Bitrix24 e Supabase</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Entity selector */}
        <Select value={bitrixEntity} onValueChange={(v) => setBitrixEntity(v as any)}>
          <SelectTrigger className="w-[130px] h-8 text-xs text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead">Lead (Bitrix)</SelectItem>
            <SelectItem value="deal">Deal (Bitrix)</SelectItem>
          </SelectContent>
        </Select>

        {/* Table selector */}
        <Select value={supabaseTable} onValueChange={setSupabaseTable}>
          <SelectTrigger className="w-[140px] h-8 text-xs text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SUPABASE_TABLES).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-7"
            placeholder="Buscar campo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter toggle */}
        <Button
          variant={showOnlyMapped ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => setShowOnlyMapped(!showOnlyMapped)}
        >
          <Filter className="h-3 w-3" />
          Apenas mapeados
        </Button>

        <div className="flex-1" />

        {/* Counters */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Total: <strong className="text-foreground">{totalFields}</strong></span>
          <span>Mapeados: <strong className="text-primary">{mappedCount}</strong></span>
        </div>

        {/* Actions */}
        <Button variant="outline" size="sm" className="h-8" onClick={() => fetchBitrixFields(bitrixEntity)} disabled={loadingFields}>
          <RefreshCw className={`h-3.5 w-3.5 ${loadingFields ? "animate-spin" : ""}`} />
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={saveAll} disabled={saving || mappedCount === 0}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </Button>
      </div>

      {/* Main Table */}
      <div className="border rounded-lg overflow-hidden">
        <ScrollArea className="h-[460px]">
          {loadingMappings || loadingFields ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {loadingFields ? "Carregando campos do Bitrix..." : "Carregando mapeamentos..."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8 py-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs py-2 font-semibold">Campo Supabase</TableHead>
                  <TableHead className="text-xs py-2 font-semibold w-[70px]">Tipo</TableHead>
                  <TableHead className="text-xs py-2 w-6"></TableHead>
                  <TableHead className="text-xs py-2 font-semibold">Campo Bitrix24</TableHead>
                  <TableHead className="text-xs py-2 font-semibold w-[80px]">Direção</TableHead>
                  <TableHead className="text-xs py-2 font-semibold w-[90px]">Status</TableHead>
                  <TableHead className="text-xs py-2 w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                      {rows.length === 0
                        ? "Selecione uma tabela para ver os campos"
                        : "Nenhum campo encontrado com os filtros atuais"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const isMapped = row.bitrixFieldKey !== "";
                    const isSystem = !!row.isSystem;
                    return (
                      <TableRow
                        key={row.supabaseColumn}
                        className={isSystem ? "bg-emerald-500/[0.04]" : isMapped ? "bg-primary/[0.03]" : ""}
                      >
                        {/* Checkbox */}
                        <TableCell className="py-1.5">
                          <Checkbox
                            disabled={isSystem}
                            checked={selectedRows.has(row.supabaseColumn)}
                            onCheckedChange={(checked) => {
                              setSelectedRows((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(row.supabaseColumn);
                                else next.delete(row.supabaseColumn);
                                return next;
                              });
                            }}
                          />
                        </TableCell>

                        {/* Supabase column */}
                        <TableCell className="py-1.5">
                          <span className="font-mono text-xs font-medium text-foreground">{row.supabaseColumn}</span>
                        </TableCell>

                        {/* Type */}
                        <TableCell className="py-1.5">
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono text-foreground border-border">
                            {row.supabaseType}
                          </Badge>
                        </TableCell>

                        {/* Arrow */}
                        <TableCell className="py-1.5 px-1">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>

                        {/* Bitrix field dropdown / system label */}
                        <TableCell className="py-1.5">
                          {isSystem ? (
                            <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate max-w-[280px]" title={getBitrixFieldLabel(row.bitrixFieldKey)}>
                              {getBitrixFieldLabel(row.bitrixFieldKey)}
                            </div>
                          ) : (
                            <Select
                              value={row.bitrixFieldKey || "__none__"}
                              onValueChange={(v) =>
                                updateRow(row.supabaseColumn, {
                                  bitrixFieldKey: v === "__none__" ? "" : v,
                                })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-full max-w-[280px]">
                                <SelectValue placeholder="Nenhum" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                <SelectItem value="__none__" className="text-xs text-muted-foreground">
                                  Nenhum
                                </SelectItem>
                                {bitrixFields.map((f) => (
                                  <SelectItem key={f.key} value={f.key} className="text-xs">
                                    <span className="font-medium">{f.title}</span>
                                    <span className="text-muted-foreground ml-1">— {f.key}</span>
                                    <span className="text-muted-foreground ml-1 text-[10px]">({f.type})</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>

                        {/* Sync direction */}
                        <TableCell className="py-1.5">
                          {isSystem ? (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                              {row.syncDirection === "bidirectional" ? "⇆" : row.syncDirection === "supabase_to_bitrix" ? "S→B" : "B→S"}
                            </Badge>
                          ) : (
                            <Select
                              value={row.syncDirection}
                              onValueChange={(v) =>
                                updateRow(row.supabaseColumn, { syncDirection: v })
                              }
                            >
                              <SelectTrigger className="h-7 text-[10px] w-[68px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bitrix_to_supabase" className="text-xs">B→S</SelectItem>
                                <SelectItem value="supabase_to_bitrix" className="text-xs">S→B</SelectItem>
                                <SelectItem value="bidirectional" className="text-xs">⇆</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-1.5">
                          {isSystem ? (
                            <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                              Auto (sistema)
                            </Badge>
                          ) : isMapped ? (
                            <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                              Mapeado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                              Não mapeado
                            </Badge>
                          )}
                        </TableCell>

                        {/* Remove */}
                        <TableCell className="py-1.5">
                          {isMapped && !isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => clearMapping(row.supabaseColumn)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
