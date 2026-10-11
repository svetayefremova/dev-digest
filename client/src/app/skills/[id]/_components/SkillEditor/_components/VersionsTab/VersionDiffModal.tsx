/* VersionDiffModal — line-by-line diff of one historical body against the
   skill's current body (old → current: red lines are gone, green are new). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { SkillVersion } from "@devdigest/shared";
import { diffLines, diffStat, type DiffKind } from "./helpers";
import { s } from "./styles";

const MARKER: Record<DiffKind, string> = { same: "", add: "+", del: "−" };

export function VersionDiffModal({
  version,
  currentVersion,
  currentBody,
  onClose,
}: {
  version: SkillVersion;
  currentVersion: number;
  currentBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(version.body, currentBody), [version.body, currentBody]);
  const { added, removed } = diffStat(lines);
  const identical = added === 0 && removed === 0;

  return (
    <Modal
      width={860}
      title={t("versions.diffTitle", { version: version.version, current: currentVersion })}
      subtitle={t("versions.diffSubtitle")}
      onClose={onClose}
    >
      {identical ? (
        <div style={s.identical}>{t("versions.diffIdentical")}</div>
      ) : (
        <>
          <div className="mono tnum" style={s.diffStat}>
            <span style={s.addText}>{t("versions.diffAdded", { count: added })}</span>
            <span style={s.delText}>{t("versions.diffRemoved", { count: removed })}</span>
          </div>
          <div className="mono" style={s.diffBody}>
            {lines.map((line, i) => (
              <div key={i} data-diff={line.kind} style={s.diffLine(line.kind)}>
                <span className="tnum" style={s.lineNo}>
                  {line.oldNo ?? ""}
                </span>
                <span className="tnum" style={s.lineNo}>
                  {line.newNo ?? ""}
                </span>
                <span style={s.marker(line.kind)}>{MARKER[line.kind]}</span>
                <span style={s.lineText(line.kind)}>{line.text || " "}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
