import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const periods = [
  { label: "Hoje", value: "today" },
  { label: "Últimos 7 dias", value: "7d" },
  { label: "Últimos 30 dias", value: "30d" },
  { label: "Este mês", value: "month" },
  { label: "Último trimestre", value: "quarter" },
  { label: "Este ano", value: "year" },
  { label: "Todo período", value: "all" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function PeriodFilter({ value, onChange }: Props) {
  const label = periods.find((p) => p.value === value)?.label || "Período";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CalendarDays className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50">
        {periods.map((p) => (
          <DropdownMenuItem
            key={p.value}
            className={value === p.value ? "bg-accent font-semibold" : ""}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
