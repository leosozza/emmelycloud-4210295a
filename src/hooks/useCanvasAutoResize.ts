import { useCallback } from "react";
import { calcTextareaHeight } from "@/lib/messageLayout";

/**
 * Hook that returns a handleInput callback for reflow-free textarea auto-resize.
 * Uses canvas text measurement instead of reading scrollHeight.
 */
export function useCanvasAutoResize(
  onChange: (value: string) => void,
  minH = 44,
  maxH = 120
) {
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);
      const el = e.target;
      const w = el.offsetWidth;
      if (w > 0) {
        el.style.height = calcTextareaHeight(val, w, minH, maxH) + "px";
      } else {
        el.style.height = minH + "px";
      }
    },
    [onChange, minH, maxH]
  );

  return handleInput;
}
