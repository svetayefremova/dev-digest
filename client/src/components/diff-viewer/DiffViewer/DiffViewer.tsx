/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import { FileGroup } from "../FileGroup";
import type { DiffFileGroup, DiffFindingApi } from "../findings";

export function DiffViewer({
  files,
  commenting,
  groups,
  findings,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** When set, files render grouped (caller-defined); otherwise a flat list. */
  groups?: DiffFileGroup[];
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  if (groups) {
    return (
      <div style={{ ...s.list, gap: 18 }}>
        {groups.map((g) => (
          <FileGroup key={g.id} group={g}>
            {g.files.map((f) => (
              <FileCard
                key={f.path}
                file={f}
                commenting={commenting}
                findings={findings}
                defaultOpen={g.defaultOpen}
              />
            ))}
          </FileGroup>
        ))}
      </div>
    );
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />
      ))}
    </div>
  );
}
