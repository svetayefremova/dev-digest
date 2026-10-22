import type { CSSProperties } from "react";

/** Co-located styles for the Project Context page (two full-height panes, design N6). */
export const s = {
  page: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 340px) 1fr",
    height: "calc(100vh - 56px)",
    minHeight: 420,
  } satisfies CSSProperties,
  state: { gridColumn: "1 / -1", padding: "28px 32px" } satisfies CSSProperties,
};
