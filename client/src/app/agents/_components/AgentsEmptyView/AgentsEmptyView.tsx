/* AgentsEmptyView — the detail pane of /agents when the workspace has no
   agents: what an agent is, plus the two ways to create the first one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Icon } from "@devdigest/ui";
import { CreateAgentModal } from "../CreateAgentModal";
import { TEMPLATES } from "../AgentsSidebar";
import { s } from "./styles";

export function AgentsEmptyView() {
  const t = useTranslations("agents");
  const [creating, setCreating] = React.useState(false);

  return (
    <div style={s.wrap}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.iconBox}>
        <Icon.Cpu size={26} />
      </div>
      <div style={s.title}>{t("list.emptyTitle")}</div>
      <div style={s.body}>{t("list.emptyBody")}</div>
      <div style={s.actions}>
        <Button kind="primary" icon="Plus" onClick={() => setCreating(true)}>
          {t("list.emptyCta")}
        </Button>
        <Dropdown
          width={220}
          align="right"
          trigger={
            <Button kind="secondary" iconRight="ChevronDown">
              {t("list.startFromTemplate")}
            </Button>
          }
          items={TEMPLATES.map((tp) => ({ label: tp, icon: "Cpu" as const, onClick: () => setCreating(true) }))}
        />
      </div>
    </div>
  );
}
