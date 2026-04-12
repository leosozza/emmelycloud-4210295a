/**
 * messageLayout.ts — Pre-calculate message bubble heights for virtualisation.
 *
 * Uses a hidden OffscreenCanvas (or 2d canvas) to measure text widths,
 * then computes exact line-wrapping and bubble height WITHOUT DOM reflows.
 *
 * Inspired by @chenglou/pretext layout-without-DOM philosophy.
 */

import type { Message } from "@/types/conversation";

// ── Constants matching the CSS in MessageBubble / ChatPanel ──────────────────
const FONT = "400 13.5px Inter, system-ui, sans-serif";
const LINE_HEIGHT = 13.5 * 1.4; // ~19px
const BUBBLE_PAD_X = 14; // px-3.5 = 14px each side
const BUBBLE_PAD_Y = 8; // py-2 = 8px each side
const SOURCE_LABEL_H = 18; // ~18px when present (icon + text + mb-1)
const TIMESTAMP_ROW_H = 20; // time + status icons row
const DATE_SEPARATOR_H = 44; // day divider height
const MEDIA_IMG_H = 200; // estimated image height
const MEDIA_VIDEO_H = 220;
const MEDIA_AUDIO_H = 48;
const MEDIA_DOC_H = 56;
const MEDIA_UNAVAILABLE_H = 28;

// Canvas context singleton for text measurement
let _ctx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    const c = document.createElement("canvas");
    _ctx = c.getContext("2d")!;
    _ctx.font = FONT;
  }
  return _ctx;
}

/** Measure text width via Canvas 2D — no DOM reflow. */
function measureText(text: string): number {
  return getCtx().measureText(text).width;
}

/** Count how many visual lines a text occupies inside a given maxWidth. */
function countLines(text: string, maxWidth: number): number {
  if (!text) return 0;
  const words = text.split(/(\s+)/); // keep whitespace tokens
  let lines = 1;
  let lineWidth = 0;

  for (const word of words) {
    if (word === "\n" || word === "\r\n") {
      lines++;
      lineWidth = 0;
      continue;
    }
    const w = measureText(word);
    if (lineWidth + w > maxWidth && lineWidth > 0) {
      lines++;
      lineWidth = w;
    } else {
      lineWidth += w;
    }
  }
  return lines;
}

/** Find the tightest width that fits the text (shrink-wrap). */
export function shrinkWrapWidth(text: string, maxWidth: number): number {
  if (!text) return 0;
  const lines = text.split("\n");
  let widest = 0;

  for (const line of lines) {
    const words = line.split(/(\s+)/);
    let lineWidth = 0;
    let maxLineWidth = 0;

    for (const word of words) {
      const w = measureText(word);
      if (lineWidth + w > maxWidth && lineWidth > 0) {
        maxLineWidth = Math.max(maxLineWidth, lineWidth);
        lineWidth = w;
      } else {
        lineWidth += w;
      }
    }
    maxLineWidth = Math.max(maxLineWidth, lineWidth);
    widest = Math.max(widest, maxLineWidth);
  }

  // Minimum width = timestamp row (~80px) + padding
  return Math.max(widest + BUBBLE_PAD_X * 2, 100);
}

/** Calculate textarea height without reflows. */
export function calcTextareaHeight(
  text: string,
  width: number,
  minH = 44,
  maxH = 120
): number {
  if (!text) return minH;
  const innerW = width - 32; // pl-4 + pr-4
  const lines = countLines(text, innerW);
  const textH = lines * (14 * 1.5); // 14px font, 1.5 line-height
  const padded = textH + 24; // py-3 top+bottom
  return Math.min(Math.max(padded, minH), maxH);
}

// ── Check if a message has a source label ────────────────────────────────────
function hasSourceLabel(msg: Message): boolean {
  const isOutgoing = msg.direction === "outgoing" || msg.direction === "outbound";
  if (!isOutgoing) return false;
  if (msg.is_from_bot) return true;
  const source = msg.metadata?.source as string | undefined;
  return !!(
    source === "emmely_app" ||
    source === "thoth_app" ||
    source === "bitrix24_operator" ||
    source === "whatsapp_manual"
  );
}

// ── Media height helper ──────────────────────────────────────────────────────
function mediaHeight(msg: Message): number {
  const type = msg.message_type ?? msg.media_type;
  const hasUrl = !!msg.media_url;
  const isHttp = hasUrl && msg.media_url!.startsWith("http");

  if (type === "audio" || type === "ptt") {
    return isHttp ? MEDIA_AUDIO_H : MEDIA_UNAVAILABLE_H;
  }
  if (type === "image") {
    return isHttp ? MEDIA_IMG_H : MEDIA_UNAVAILABLE_H;
  }
  if (type === "video") {
    return isHttp ? MEDIA_VIDEO_H : MEDIA_UNAVAILABLE_H;
  }
  if (type === "document") {
    return isHttp ? MEDIA_DOC_H : MEDIA_UNAVAILABLE_H;
  }
  return 0;
}

export interface VirtualItem {
  type: "date-separator" | "message";
  key: string;
  height: number;
  msg?: Message;
  dateLabel?: string;
}

/**
 * Build a flat list of virtual items (date separators + messages)
 * with pre-calculated heights, ready for the virtualizer.
 */
export function buildVirtualItems(
  messages: Message[],
  containerWidth: number
): VirtualItem[] {
  // Desktop: 65% max, Mobile: 80% max — approximate based on container
  const isMobile = containerWidth < 640;
  const bubbleMaxW = Math.floor(containerWidth * (isMobile ? 0.8 : 0.65));
  const textMaxW = bubbleMaxW - BUBBLE_PAD_X * 2;

  const items: VirtualItem[] = [];
  let lastDateStr = "";

  for (const msg of messages) {
    // Date separator
    const dateStr = new Date(msg.created_at).toDateString();
    if (dateStr !== lastDateStr) {
      items.push({
        type: "date-separator",
        key: `date-${dateStr}`,
        height: DATE_SEPARATOR_H,
        dateLabel: msg.created_at,
      });
      lastDateStr = dateStr;
    }

    // Calculate bubble height
    let h = BUBBLE_PAD_Y * 2; // vertical padding

    // Source label
    if (hasSourceLabel(msg)) h += SOURCE_LABEL_H;

    // Media
    h += mediaHeight(msg);

    // Text content
    if (msg.content) {
      const lines = countLines(msg.content, textMaxW);
      h += lines * LINE_HEIGHT;
    }

    // Timestamp row
    h += TIMESTAMP_ROW_H;

    // Margin bottom (mb-2 = 8px)
    h += 8;

    items.push({
      type: "message",
      key: msg.id,
      height: Math.ceil(h),
      msg,
    });
  }

  return items;
}
