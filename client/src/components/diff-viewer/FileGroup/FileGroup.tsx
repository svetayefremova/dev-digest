/* FileGroup — presentational group header (colour, label, hint, meta) + its files. */
"use client";

import React from "react";
import { s } from "../styles";

export interface FileGroupHeader {
  label: string;
  hint: string;
  meta: string;
  color: string;
}

export function FileGroup({ group, children }: { group: FileGroupHeader; children: React.ReactNode }) {
  return (
    <section aria-label={group.label} style={s.group}>
      <div style={s.groupHeader}>
        <span aria-hidden style={{ ...s.groupSwatch, background: group.color }} />
        <h3 style={s.groupLabel}>{group.label}</h3>
        <span style={s.groupHint}>{group.hint}</span>
        <span className="tnum" style={s.groupMeta}>
          {group.meta}
        </span>
      </div>
      <div style={s.list}>{children}</div>
    </section>
  );
}
