import type { CSSProperties } from "react";
import { FONT_SIZE, LINE_HEIGHT, MIN_LINES } from "./constants";

const PAD_Y = 10;

/** Text metrics shared by the highlight layer and the textarea on top of it. */
const text: CSSProperties = {
  margin: 0,
  padding: `${PAD_Y}px 14px`,
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_HEIGHT}px`,
  whiteSpace: "pre",
  tabSize: 2,
  letterSpacing: 0,
};

/** Co-located styles for SkillBodyEditor. */
export const s = {
  wrap: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  fileName: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  // One scroller for gutter + code, so the line numbers never fall out of step.
  scroller: { display: "flex", alignItems: "stretch", maxHeight: 520, overflow: "auto" } satisfies CSSProperties,
  gutter: {
    position: "sticky",
    left: 0,
    zIndex: 1,
    flexShrink: 0,
    minWidth: 44,
    padding: `${PAD_Y}px 10px`,
    textAlign: "right",
    userSelect: "none",
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_HEIGHT}px`,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
  } satisfies CSSProperties,
  // Sized by the highlight layer (its widest line / line count); the textarea
  // fills it, so neither scrolls on its own.
  code: {
    position: "relative",
    flex: "1 0 auto",
    minHeight: MIN_LINES * LINE_HEIGHT + PAD_Y * 2,
  } satisfies CSSProperties,
  highlight: { ...text, color: "var(--text-primary)", pointerEvents: "none" } satisfies CSSProperties,
  heading: { color: "var(--accent-text)" } satisfies CSSProperties,
  placeholder: { color: "var(--text-muted)" } satisfies CSSProperties,
  // Transparent text over the highlight layer: the caret and the selection are
  // the textarea's, the visible glyphs are the layer's.
  textarea: {
    ...text,
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    resize: "none",
    overflow: "hidden",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "transparent",
    caretColor: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
