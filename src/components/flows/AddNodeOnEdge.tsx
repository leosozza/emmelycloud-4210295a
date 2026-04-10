import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { Plus, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NODE_TYPE_META, NODE_CATEGORIES, type FlowNodeType } from './FlowNodeTypes';

export default function AddNodeOnEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onSelectType = (type: FlowNodeType) => {
    if (data?.onInsertNode) {
      data.onInsertNode(id, type);
    }
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-6 h-6 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform border-2 border-background"
                title="Inserir bloco"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 shadow-2xl" side="right" align="center">
              <Command className="rounded-lg border shadow-md">
                <CommandInput placeholder="Procurar bloco..." className="h-9 text-xs" />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>Nenhum bloco encontrado.</CommandEmpty>
                  {NODE_CATEGORIES.map((cat) => (
                    <CommandGroup key={cat.id} heading={cat.label} className="text-[10px] uppercase font-bold text-muted-foreground px-2 pt-2">
                      {cat.types.map((type) => {
                        const meta = NODE_TYPE_META[type];
                        if (!meta) return null;
                        const Icon = meta.icon;
                        return (
                          <CommandItem
                            key={type}
                            onSelect={() => onSelectType(type)}
                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <div 
                              className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${meta.color}15` }}
                            >
                              <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-semibold truncate leading-none">
                                {meta.label}
                              </span>
                              <span className="text-[9px] text-muted-foreground truncate leading-tight mt-0.5">
                                {meta.description}
                              </span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
