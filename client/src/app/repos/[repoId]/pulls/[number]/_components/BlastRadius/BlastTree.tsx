/* BlastTree — one collapsible row per changed symbol with its callers,
   affected endpoints and cron jobs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
import { s } from "./styles";

interface BlastTreeProps {
  downstream: DownstreamImpact[];
  expanded: Set<string>;
  selected: string | null;
  repoFullName: string | null;
  headSha: string;
  onToggle: (symbol: string) => void;
}

export function BlastTree({ downstream, expanded, selected, repoFullName, headSha, onToggle }: BlastTreeProps) {
  const t = useTranslations("blast");
  return (
    <div style={s.tree}>
      {downstream.map((d) => {
        const open = expanded.has(d.symbol);
        const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
        return (
          <div key={d.symbol}>
            <button
              type="button"
              aria-expanded={open}
              style={s.groupHead(selected === d.symbol)}
              onClick={() => onToggle(d.symbol)}
            >
              <Chevron size={13} />
              <span style={s.accent}>
                <Icon.Code size={13} />
              </span>
              <span style={s.symbolName}>{d.symbol}()</span>
              <span style={s.count}>{t("callerCount", { count: d.callers.length })}</span>
            </button>
            {open && (
              <div style={s.groupBody}>
                {d.callers.map((c) => {
                  const label = `${c.file}:${c.line}`;
                  return (
                    <div key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                      <Icon.CornerDownRight size={12} />
                      {repoFullName ? (
                        <a
                          href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={s.link}
                          title={c.name}
                        >
                          {label}
                        </a>
                      ) : (
                        <span title={c.name}>{label}</span>
                      )}
                    </div>
                  );
                })}
                {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                  <div style={s.chips}>
                    {d.endpoints_affected.map((e) => (
                      <span key={`e:${e}`} style={s.chip("accent")} aria-label={t("endpointChip", { name: e })}>
                        <Icon.Globe size={12} />
                        {e}
                      </span>
                    ))}
                    {d.crons_affected.map((c) => (
                      <span key={`c:${c}`} style={s.chip("warn")} aria-label={t("cronChip", { name: c })}>
                        <Icon.Clock size={12} />
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
