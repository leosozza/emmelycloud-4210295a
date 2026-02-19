import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";
import { useBitrixFields, type BitrixFieldInfo } from "@/hooks/useBitrixFields";

interface BitrixFieldSelectorProps {
  entity: "lead" | "deal" | "spa";
  spaEntityTypeId?: string;
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}

export default function BitrixFieldSelector({ entity, spaEntityTypeId, value, onChange, placeholder }: BitrixFieldSelectorProps) {
  const { fields, loading, error, refetch } = useBitrixFields(entity, spaEntityTypeId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return fields.filter(f => !f.isReadOnly);
    const q = search.toLowerCase();
    return fields.filter(f => !f.isReadOnly && (f.key.toLowerCase().includes(q) || f.title.toLowerCase().includes(q)));
  }, [fields, search]);

  const selectedField = fields.find(f => f.key === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-7 text-xs justify-between w-full px-2 font-normal">
          <span className="truncate">
            {selectedField ? `${selectedField.title} (${selectedField.key})` : value || placeholder || "Selecionar campo"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex items-center gap-1 p-2 border-b">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <Input
            className="h-6 text-[10px] border-0 shadow-none focus-visible:ring-0 p-0"
            placeholder="Buscar campo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => refetch()} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
        <ScrollArea className="max-h-[220px]">
          {error && (
            <div className="p-2 text-[10px] text-destructive">{error}</div>
          )}
          {loading && fields.length === 0 && (
            <div className="p-3 text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando campos...
            </div>
          )}
          {!loading && filtered.length === 0 && !error && (
            <div className="p-3 text-[10px] text-muted-foreground text-center">
              {fields.length === 0 ? "Nenhuma integração Bitrix24 ativa" : "Nenhum campo encontrado"}
            </div>
          )}
          <div className="p-1">
            {/* Allow manual/variable entry */}
            {search && !filtered.find(f => f.key === search) && (
              <button
                className="w-full text-left px-2 py-1 text-[10px] rounded hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                onClick={() => { onChange(search); setOpen(false); setSearch(""); }}
              >
                Usar "{search}" como campo manual
              </button>
            )}
            {filtered.map(f => (
              <button
                key={f.key}
                className={`w-full text-left px-2 py-1.5 text-[10px] rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-1 ${value === f.key ? "bg-accent text-accent-foreground" : ""}`}
                onClick={() => { onChange(f.key); setOpen(false); setSearch(""); }}
              >
                <span className="truncate flex-1">{f.title}</span>
                <span className="text-[9px] text-muted-foreground font-mono shrink-0">{f.key}</span>
                {f.isRequired && <Badge variant="outline" className="h-3 text-[7px] px-1 shrink-0">REQ</Badge>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
