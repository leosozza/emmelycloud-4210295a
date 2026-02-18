import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, PanelLeftClose, PanelLeft } from "lucide-react";
import { NODE_CATEGORIES, NODE_TYPE_META, type FlowNodeType } from "./FlowNodeTypes";

interface FlowNodePaletteProps {
  onAddNode: (type: FlowNodeType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function FlowNodePalette({ onAddNode, collapsed, onToggleCollapse }: FlowNodePaletteProps) {
  const [search, setSearch] = useState("");

  if (collapsed) {
    return (
      <div className="w-10 border-r bg-card flex flex-col items-center py-2 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleCollapse}>
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const lowerSearch = search.toLowerCase();

  return (
    <div className="w-56 border-r bg-card flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-foreground">Blocos</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleCollapse}>
          <PanelLeftClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="h-7 text-xs pl-7"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-3 space-y-1">
          {NODE_CATEGORIES.map((cat) => {
            const filteredTypes = cat.types.filter((t) => {
              const meta = NODE_TYPE_META[t];
              return (
                meta.label.toLowerCase().includes(lowerSearch) ||
                meta.description.toLowerCase().includes(lowerSearch)
              );
            });
            if (filteredTypes.length === 0) return null;

            return (
              <Collapsible key={cat.id} defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                  <span>{cat.label}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="h-4 text-[9px] px-1">{filteredTypes.length}</Badge>
                    <ChevronDown className="h-3 w-3 transition-transform [[data-state=closed]>&]:rotate-[-90deg]" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 mt-0.5">
                  {filteredTypes.map((type) => {
                    const meta = NODE_TYPE_META[type];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={type}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/reactflow-type", type);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onAddNode(type)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-muted/60 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}15` }}>
                          <Icon className="w-3 h-3" style={{ color: meta.color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-foreground truncate">{meta.label}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{meta.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        <div className="px-3 py-2 border-t">
          <p className="text-[9px] text-muted-foreground">
            Variáveis: <code className="text-[9px]">{"{{nome}}"}</code>, <code className="text-[9px]">{"{{telefone}}"}</code>, <code className="text-[9px]">{"{{email}}"}</code>
          </p>
        </div>
      </ScrollArea>
    </div>
  );
}
