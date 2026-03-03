import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ReportFilters as Filters } from "@/hooks/useReportsData";

interface Props {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  profiles: { id: string; full_name: string }[];
}

const LEGAL_AREAS = [
  { value: "all", label: "Todas as áreas" },
  { value: "previdencia", label: "Previdência" },
  { value: "cidadania", label: "Cidadania" },
  { value: "vistos", label: "Vistos" },
  { value: "trabalhista", label: "Trabalhista" },
  { value: "familia", label: "Família" },
  { value: "empresarial", label: "Empresarial" },
  { value: "tributario", label: "Tributário" },
  { value: "outro", label: "Outro" },
];

const PERIOD_PRESETS = [
  { label: "Este mês", getValue: () => ({ startDate: startOfMonth(new Date()), endDate: endOfMonth(new Date()) }) },
  { label: "Último mês", getValue: () => ({ startDate: startOfMonth(subMonths(new Date(), 1)), endDate: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "Últimos 3 meses", getValue: () => ({ startDate: startOfMonth(subMonths(new Date(), 2)), endDate: endOfMonth(new Date()) }) },
  { label: "Últimos 6 meses", getValue: () => ({ startDate: startOfMonth(subMonths(new Date(), 5)), endDate: endOfMonth(new Date()) }) },
  { label: "Este ano", getValue: () => ({ startDate: new Date(new Date().getFullYear(), 0, 1), endDate: new Date() }) },
];

export function ReportFiltersBar({ filters, onFiltersChange, profiles }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      {/* Period presets */}
      <div className="flex gap-1">
        {PERIOD_PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => onFiltersChange({ ...filters, ...p.getValue() })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Start date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("text-xs gap-1", !filters.startDate && "text-muted-foreground")}>
            <CalendarIcon className="h-3 w-3" />
            {format(filters.startDate, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.startDate}
            onSelect={(d) => d && onFiltersChange({ ...filters, startDate: d })}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      <span className="text-xs text-muted-foreground">até</span>

      {/* End date */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("text-xs gap-1", !filters.endDate && "text-muted-foreground")}>
            <CalendarIcon className="h-3 w-3" />
            {format(filters.endDate, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.endDate}
            onSelect={(d) => d && onFiltersChange({ ...filters, endDate: d })}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      <div className="h-6 w-px bg-border" />

      {/* Legal area */}
      <Select value={filters.legalArea || "all"} onValueChange={(v) => onFiltersChange({ ...filters, legalArea: v === "all" ? null : v })}>
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Área jurídica" />
        </SelectTrigger>
        <SelectContent>
          {LEGAL_AREAS.map((a) => (
            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Responsible */}
      <Select value={filters.responsibleId || "all"} onValueChange={(v) => onFiltersChange({ ...filters, responsibleId: v === "all" ? null : v })}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
