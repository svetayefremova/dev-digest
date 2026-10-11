/* SkillBodyEditor — the skill body as a file: a header (file name, `unsaved`
   badge, token count) over a mono editor with line numbers. No editor
   dependency: a transparent <textarea> sits on a highlight layer that renders
   the same text and colours markdown `#` / `##` headings. Lines do not wrap, so
   one line of text is always one numbered row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { estimateTokens, markHeadingLines } from "./helpers";
import { s } from "./styles";

export function SkillBodyEditor({
  fileName,
  value,
  onChange,
  savedBody,
  savedTokens,
  unsaved,
  placeholder,
}: {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  /** The body as last saved, and its exact server-side token count. */
  savedBody: string;
  savedTokens: number;
  /** The form holds changes that are not saved yet. */
  unsaved: boolean;
  placeholder?: string;
}) {
  const t = useTranslations("skills");
  const lines = value.split("\n");
  const headings = markHeadingLines(lines);
  // Exact while the text is what the server counted; an estimate once it drifts.
  const tokens =
    value === savedBody
      ? t("bodyEditor.tokens", { count: savedTokens })
      : t("bodyEditor.tokensEstimate", { count: estimateTokens(value) });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.FileText size={13} style={s.fileIcon} />
        <span className="mono" style={s.fileName} title={fileName}>
          {fileName}
        </span>
        {unsaved && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" dot>
            {t("bodyEditor.unsaved")}
          </Badge>
        )}
        <span className="tnum" style={s.tokens}>
          {tokens}
        </span>
      </div>
      <div style={s.scroller}>
        <div className="mono" style={s.gutter} aria-hidden>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div style={s.code}>
          <pre className="mono" style={s.highlight} aria-hidden>
            {value === "" ? (
              <span style={s.placeholder}>{placeholder}</span>
            ) : (
              lines.map((line, i) => (
                <div key={i} style={headings[i] ? s.heading : undefined}>
                  {/* An empty <div> has no height; keep the row. */}
                  {line === "" ? "\n" : line}
                </div>
              ))
            )}
          </pre>
          <textarea
            className="mono"
            style={s.textarea}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t("form.body")}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </div>
    </div>
  );
}
