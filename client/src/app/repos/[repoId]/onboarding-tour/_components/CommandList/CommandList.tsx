"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { stripTrailingComment } from "./helpers";
import { s } from "./styles";

export function CommandList({
  runLocally,
  notice,
}: {
  runLocally: OnboardingTour["runLocally"];
  /** Shown above the commands (e.g. no supported source files). */
  notice?: string;
}) {
  const t = useTranslations("onboarding");
  const [announcement, setAnnouncement] = React.useState("");
  const { commands, envVars } = runLocally;

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(stripTrailingComment(command));
      setAnnouncement(t("copied"));
    } catch {
      setAnnouncement("");
    }
  };

  return (
    <div style={{ ...s.wrap, position: "relative" }}>
      {notice && <div style={s.notice}>{notice}</div>}
      {commands.length === 0 ? (
        <div style={s.notice}>{t("noRunInstructions")}</div>
      ) : (
        commands.map((cmd, i) => (
          <div key={`${i}-${cmd.command}`} style={s.row}>
            <span style={s.index}>{i + 1}</span>
            <code className="mono" style={s.command}>
              {cmd.command}
              {cmd.comment ? <span style={s.comment}> # {cmd.comment}</span> : null}
            </code>
            <button
              type="button"
              style={s.copy}
              aria-label={t("copyCommand", { command: stripTrailingComment(cmd.command) })}
              onClick={() => void copy(cmd.command)}
            >
              <Icon.Copy size={14} aria-hidden />
            </button>
          </div>
        ))
      )}
      {envVars.length > 0 && (
        <div style={s.env}>
          {t("envVars")}:{" "}
          <span className="mono">{envVars.join(", ")}</span>
        </div>
      )}
      <div role="status" aria-live="polite" style={s.live}>
        {announcement}
      </div>
    </div>
  );
}
