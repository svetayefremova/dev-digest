/* FileGroup — accordion section: header (chevron, colour, label, hint, meta)
   toggles the whole group; files render only while open. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s, chevronFor } from "../styles";

export interface FileGroupHeader {
  label: string;
  hint: string;
  meta: string;
  color: string;
}

export function FileGroup({ group, children }: { group: FileGroupHeader; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  const bodyId = React.useId();
  return (
    <section aria-label={group.label} style={s.group}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        style={s.groupHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span aria-hidden style={{ ...s.groupSwatch, background: group.color }} />
        <h3 style={s.groupLabel}>{group.label}</h3>
        <span style={s.groupHint}>{group.hint}</span>
        <span className="tnum" style={s.groupMeta}>
          {group.meta}
        </span>
      </button>
      {open && (
        <div id={bodyId} style={s.list}>
          {children}
        </div>
      )}
    </section>
  );
}
