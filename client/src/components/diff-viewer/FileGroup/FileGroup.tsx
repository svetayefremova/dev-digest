/* FileGroup — accordion section. Header: chevron + colour + label + hint toggle
   the group; on the right a red findings counter, the file count and an
   expand/collapse-all-files button (broadcast to FileCards via context). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s, chevronFor } from "../styles";

export interface FileGroupHeader {
  label: string;
  hint: string;
  color: string;
  filesLabel: string;
  findingCount: number;
  findingsTitle?: string;
}

/** "Open/close every file in this group" signal; `n` re-fires the same value. */
export const GroupExpandContext = React.createContext<{ open: boolean; n: number } | null>(null);

export function FileGroup({ group, children }: { group: FileGroupHeader; children: React.ReactNode }) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(true);
  const [expand, setExpand] = React.useState<{ open: boolean; n: number } | null>(null);
  const bodyId = React.useId();
  const nextAll = !(expand?.open ?? false);

  const toggleAll = () => {
    setOpen(true);
    setExpand((p) => ({ open: nextAll, n: (p?.n ?? 0) + 1 }));
  };

  return (
    <section aria-label={group.label} style={s.group}>
      <div style={s.groupHeader}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          style={s.groupToggle}
        >
          <Icon.ChevronRight size={13} style={chevronFor(open)} />
          <span aria-hidden style={{ ...s.groupSwatch, background: group.color }} />
          <h3 style={s.groupLabel}>{group.label}</h3>
          <span style={s.groupHint}>{group.hint}</span>
        </button>
        {group.findingCount > 0 && (
          <span className="tnum" style={s.groupFindings} title={group.findingsTitle} aria-label={group.findingsTitle}>
            <span aria-hidden style={s.findingDot} />
            {group.findingCount}
          </span>
        )}
        <span className="tnum" style={s.groupMeta}>
          {group.filesLabel}
        </span>
        <button
          type="button"
          onClick={toggleAll}
          title={t(nextAll ? "diffViewer.expandAllFiles" : "diffViewer.collapseAllFiles")}
          aria-label={t(nextAll ? "diffViewer.expandAllFiles" : "diffViewer.collapseAllFiles")}
          style={s.groupIconBtn}
        >
          <Icon.ChevronsUpDown size={13} />
        </button>
      </div>
      {open && (
        <GroupExpandContext.Provider value={expand}>
          <div id={bodyId} style={s.list}>
            {children}
          </div>
        </GroupExpandContext.Provider>
      )}
    </section>
  );
}
