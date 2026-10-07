import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "uncovered-branches",
  description: "Flag each new branch no test exercises.",
  type: "rubric",
  source: "manual",
  body: "# Uncovered branches",
  enabled: true,
  version: 1,
  body_tokens: 4,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders the name, description, type and source", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByRole("button", { name: "uncovered-branches" })).toBeInTheDocument();
    expect(screen.getByText("Flag each new branch no test exercises.")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("names an imported source and falls back when there is no description", () => {
    renderCard(<SkillCard skill={{ ...SKILL, source: "imported_file", description: "" }} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows agents, pull and accept in the footer when there is run data", () => {
    renderCard(<SkillCard skill={{ ...SKILL, usage: { agents: 3, pull_pct: 42, accept_pct: 75 } }} />);
    expect(screen.getByText("3 agents · 42% pull · 75% accept")).toBeInTheDocument();
  });

  it("leaves out the metrics that have no data", () => {
    renderCard(<SkillCard skill={{ ...SKILL, usage: { agents: 1, pull_pct: null, accept_pct: null } }} />);
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.queryByText(/pull/)).not.toBeInTheDocument();
    expect(screen.queryByText(/accept/)).not.toBeInTheDocument();
  });

  it("keeps a metric that is a real 0% and drops only the missing one", () => {
    renderCard(<SkillCard skill={{ ...SKILL, usage: { agents: 2, pull_pct: 0, accept_pct: null } }} />);
    expect(screen.getByText("2 agents · 0% pull")).toBeInTheDocument();
  });

  it("clicking the card opens the skill; there is no global on/off switch", () => {
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "uncovered-branches" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
