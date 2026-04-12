/**
 * chatLayout.ts — Canvas-based height calculation for simple AI chat messages.
 * Lighter version of messageLayout.ts — no media, no source labels, no date separators.
 */

const FONT_USER = "400 14px Inter, system-ui, sans-serif";
const FONT_ASSISTANT = "400 14px Inter, system-ui, sans-serif";
const LINE_HEIGHT = 14 * 1.5; // 21px
const BUBBLE_PAD_Y = 12; // py-2.5 top + bottom
const BUBBLE_PAD_X = 16; // px-4 each side
const TIMESTAMP_H = 16; // small timestamp line
const GAP = 24; // space-y-6 between items
const LOADING_ITEM_H = 48;

let _ctx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    const c = document.createElement("canvas");
    _ctx = c.getContext("2d")!;
  }
  return _ctx;
}

function countLines(text: string, maxWidth: number, font: string): number {
  if (!text) return 0;
  const ctx = getCtx();
  ctx.font = font;
  const words = text.split(/(\s+)/);
  let lines = 1;
  let lineWidth = 0;

  for (const word of words) {
    if (word === "\n" || word === "\r\n") {
      lines++;
      lineWidth = 0;
      continue;
    }
    const w = ctx.measureText(word).width;
    if (lineWidth + w > maxWidth && lineWidth > 0) {
      lines++;
      lineWidth = w;
    } else {
      lineWidth += w;
    }
  }
  return lines;
}

export interface ChatVirtualItem {
  type: "message" | "loading";
  key: string;
  height: number;
  index: number;
}

/**
 * Build virtual items for a simple {role, content} message list.
 */
export function buildChatVirtualItems(
  messages: Array<{ role: string; content: string }>,
  containerWidth: number,
  isLoading?: boolean
): ChatVirtualItem[] {
  const bubbleMaxW = Math.floor(containerWidth * 0.75);
  const textMaxW = bubbleMaxW - BUBBLE_PAD_X * 2;
  const items: ChatVirtualItem[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const font = msg.role === "user" ? FONT_USER : FONT_ASSISTANT;
    const lines = countLines(msg.content, textMaxW, font);
    const h = BUBBLE_PAD_Y + lines * LINE_HEIGHT + TIMESTAMP_H + GAP;
    items.push({ type: "message", key: `msg-${i}`, height: Math.ceil(h), index: i });
  }

  if (isLoading) {
    items.push({ type: "loading", key: "loading", height: LOADING_ITEM_H, index: -1 });
  }

  return items;
}
