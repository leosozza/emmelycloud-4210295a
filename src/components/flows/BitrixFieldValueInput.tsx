import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Braces, Loader2 } from "lucide-react";
import { useBitrixFields } from "@/hooks/useBitrixFields";
import { useBitrixStages, useBitrixPipelines } from "@/hooks/useBitrixStages";

interface Props {
  entity: "lead" | "deal" | "contact" | "spa";
  spaEntityTypeId?: string;
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  categoryId?: string; // for STAGE_ID resolution on deals
  placeholder?: string;
}

// Detects if the current value is a template variable like {{foo}}
function isVariable(v: string) {
  return /\{\{.+\}\}/.test(v?.trim() || "");
}

export default function BitrixFieldValueInput({
  entity, spaEntityTypeId, fieldKey, value, onChange, categoryId, placeholder,
}: Props) {
  const { fields } = useBitrixFields(entity === "contact" ? "contact" as any : entity, spaEntityTypeId);
  const meta = useMemo(() => fields.find(f => f.key === fieldKey), [fields, fieldKey]);

  // Force "variable mode" if value is already a template, or user toggles it
  const [manual, setManual] = useState<boolean>(() => isVariable(value));
  useEffect(() => {
    if (isVariable(value) && !manual) setManual(true);
  }, [value]); // eslint-disable-line

  const type = meta?.type || "";
  const key = fieldKey || "";

  // Detect if it needs stages/pipelines/items
  const isStageField =
    key === "STAGE_ID" || key === "STATUS_ID" || key === "stageId" ||
    (type === "crm_status" && (key.includes("STAGE") || key.includes("STATUS")));
  const isPipelineField =
    key === "CATEGORY_ID" || key === "categoryId" || type === "crm_category";
  const hasInlineItems = Array.isArray(meta?.items) && (meta?.items?.length || 0) > 0;
  const isBoolean = type === "boolean" || type === "char";
  const isDate = type === "date";
  const isDateTime = type === "datetime";

  const canUsePicker = !manual && (isStageField || isPipelineField || hasInlineItems || isBoolean || isDate || isDateTime);

  const toggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={manual ? "Usar seletor" : "Usar variável dinâmica"}
      className={`h-7 w-7 shrink-0 ${manual ? "text-primary" : "text-muted-foreground"}`}
      onClick={() => setManual(m => !m)}
    >
      <Braces className="h-3 w-3" />
    </Button>
  );

  const manualInput = (
    <Input
      className="h-7 text-xs flex-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "{{variavel}} ou texto fixo"}
    />
  );

  if (manual || !canUsePicker) {
    return <div className="flex gap-1 items-center">{manualInput}{toggle}</div>;
  }

  if (isStageField) {
    return (
      <div className="flex gap-1 items-center">
        <StageSelect entity={entity === "contact" ? "deal" : entity} categoryId={categoryId} spaEntityTypeId={spaEntityTypeId} value={value} onChange={onChange} />
        {toggle}
      </div>
    );
  }
  if (isPipelineField) {
    return (
      <div className="flex gap-1 items-center">
        <PipelineSelect entity={entity === "contact" ? "deal" : entity} value={value} onChange={onChange} />
        {toggle}
      </div>
    );
  }
  if (hasInlineItems) {
    return (
      <div className="flex gap-1 items-center">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Selecionar valor..." /></SelectTrigger>
          <SelectContent>
            {meta!.items!.map((it: any) => (
              <SelectItem key={String(it.ID)} value={String(it.ID)} className="text-xs">{it.VALUE}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {toggle}
      </div>
    );
  }
  if (isBoolean) {
    const on = value === "Y" || value === "true" || value === "1";
    return (
      <div className="flex gap-1 items-center h-7">
        <Switch checked={on} onCheckedChange={(v) => onChange(v ? "Y" : "N")} />
        <span className="text-[10px] text-muted-foreground">{on ? "Sim (Y)" : "Não (N)"}</span>
        <div className="flex-1" />
        {toggle}
      </div>
    );
  }
  if (isDate || isDateTime) {
    return (
      <div className="flex gap-1 items-center">
        <Input
          type={isDateTime ? "datetime-local" : "date"}
          className="h-7 text-xs flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {toggle}
      </div>
    );
  }
  return <div className="flex gap-1 items-center">{manualInput}{toggle}</div>;
}

function StageSelect({ entity, categoryId, spaEntityTypeId, value, onChange }: {
  entity: "lead" | "deal" | "spa"; categoryId?: string; spaEntityTypeId?: string; value: string; onChange: (v: string) => void;
}) {
  const { stages, loading, error } = useBitrixStages(entity, categoryId, spaEntityTypeId);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs flex-1">
        <SelectValue placeholder={loading ? "Carregando..." : "Selecionar estágio..."} />
      </SelectTrigger>
      <SelectContent>
        {loading && <div className="p-2 text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Carregando</div>}
        {error && <div className="p-2 text-[10px] text-destructive">{error}</div>}
        {!loading && stages.length === 0 && <div className="p-2 text-[10px] text-muted-foreground">Nenhum estágio</div>}
        {stages.map(s => (
          <SelectItem key={s.id} value={s.id} className="text-xs">
            <span className="truncate">{s.name}</span>
            <span className="text-[9px] text-muted-foreground font-mono ml-2">{s.id}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PipelineSelect({ entity, value, onChange }: {
  entity: "lead" | "deal" | "spa"; value: string; onChange: (v: string) => void;
}) {
  const { pipelines, loading, error } = useBitrixPipelines(entity);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs flex-1">
        <SelectValue placeholder={loading ? "Carregando..." : "Selecionar funil..."} />
      </SelectTrigger>
      <SelectContent>
        {loading && <div className="p-2 text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Carregando</div>}
        {error && <div className="p-2 text-[10px] text-destructive">{error}</div>}
        {!loading && pipelines.length === 0 && <div className="p-2 text-[10px] text-muted-foreground">Nenhum funil</div>}
        {pipelines.map(p => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            <span className="truncate">{p.name}</span>
            <span className="text-[9px] text-muted-foreground font-mono ml-2">{p.id}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
