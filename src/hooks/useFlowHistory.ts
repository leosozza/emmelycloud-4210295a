import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

export function useFlowHistory(
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
) {
  const historyRef = useRef<HistoryState[]>([]);
  const indexRef = useRef(-1);
  const skipRef = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const refreshFlags = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  const pushState = useCallback(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const state: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    // Remove future states
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(state);
    // Keep max 50 states
    if (historyRef.current.length > 50) historyRef.current.shift();
    indexRef.current = historyRef.current.length - 1;
    refreshFlags();
  }, [nodes, edges, refreshFlags]);

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    const state = historyRef.current[indexRef.current];
    skipRef.current = true;
    setNodes(JSON.parse(JSON.stringify(state.nodes)));
    skipRef.current = true;
    setEdges(JSON.parse(JSON.stringify(state.edges)));
    refreshFlags();
  }, [setNodes, setEdges, refreshFlags]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    const state = historyRef.current[indexRef.current];
    skipRef.current = true;
    setNodes(JSON.parse(JSON.stringify(state.nodes)));
    skipRef.current = true;
    setEdges(JSON.parse(JSON.stringify(state.edges)));
    refreshFlags();
  }, [setNodes, setEdges, refreshFlags]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return { pushState, undo, redo, canUndo, canRedo };
}
