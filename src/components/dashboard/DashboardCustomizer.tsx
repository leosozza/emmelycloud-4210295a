import { useState } from "react";
import { Settings2, RotateCcw, GripVertical, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { type WidgetId, WIDGET_LABELS } from "@/hooks/useDashboardLayout";

interface Props {
  widgets: WidgetId[];
  hiddenWidgets: WidgetId[];
  toggleWidget: (id: WidgetId) => void;
  resetLayout: () => void;
}

export function DashboardCustomizer({ widgets, hiddenWidgets, toggleWidget, resetLayout }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          Personalizar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Widgets visíveis
        </div>
        {widgets.map((id) => (
          <DropdownMenuItem key={id} className="flex items-center justify-between cursor-pointer" onSelect={(e) => e.preventDefault()}>
            <span className="text-sm">{WIDGET_LABELS[id]}</span>
            <Switch
              checked={!hiddenWidgets.includes(id)}
              onCheckedChange={() => toggleWidget(id)}
              className="scale-75"
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={resetLayout} className="gap-2 text-sm">
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar padrão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
