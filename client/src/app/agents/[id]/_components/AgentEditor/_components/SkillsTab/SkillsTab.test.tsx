import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import skillMessages from "../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
let skills: Skill[] = [];
let links: AgentSkillLink[] = [];

// Mock the data hooks so the tab renders without a network/query client.
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: skills, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: links, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

const skill = (id: string, name: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "rubric",
  source: "manual",
  body: "Body.",
  enabled: true,
  version: 1,
  body_tokens: 2,
  ...over,
});

const link = (skill_id: string, order: number, enabled: boolean): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, skills: skillMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

// Row order as the user reads it: each row's checkbox is named after its skill.
const rowNames = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByRole("checkbox").closest("label")!.textContent!.replace(/^Use | for this agent$/g, ""));

beforeEach(() => {
  mutate.mockClear();
  skills = [skill("a", "alpha"), skill("b", "beta"), skill("c", "gamma"), skill("d", "delta", { type: "security" })];
  // Saved order: gamma (on), alpha (off), beta (on). delta was never linked.
  links = [link("c", 0, true), link("a", 1, false), link("b", 2, true)];
});
afterEach(cleanup);

describe("SkillsTab", () => {
  it("lists every skill in link order (unlinked last) with the enabled count", () => {
    renderTab();
    expect(rowNames()).toEqual(["gamma", "alpha", "beta", "delta"]);
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Use gamma for this agent" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Use alpha for this agent" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Use delta for this agent" })).not.toBeChecked();
  });

  it("ticking a skill saves the full ordered set with that skill enabled", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use alpha for this agent" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      agentId: "ag1",
      skills: [
        { skill_id: "c", enabled: true },
        { skill_id: "a", enabled: true },
        { skill_id: "b", enabled: true },
        { skill_id: "d", enabled: false },
      ],
    });
    // Optimistic: the count updates before the server answers.
    expect(screen.getByText("3 of 4 enabled")).toBeInTheDocument();
  });

  it("ArrowUp on a drag handle moves the skill one place earlier and saves the new order", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag to reorder beta" }), { key: "ArrowUp" });
    expect(mutate.mock.calls[0]![0].skills.map((s: { skill_id: string }) => s.skill_id)).toEqual(["c", "b", "a", "d"]);
    expect(rowNames()).toEqual(["gamma", "beta", "alpha", "delta"]);
  });

  it("ArrowUp on the first skill is a no-op", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag to reorder gamma" }), { key: "ArrowUp" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("filters by name without dropping hidden skills from the saved set", () => {
    renderTab();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter skills…" }), { target: { value: "del" } });
    expect(rowNames()).toEqual(["delta"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Use delta for this agent" }));
    expect(mutate.mock.calls[0]![0].skills).toHaveLength(4);
  });

  it("marks a selected skill that is switched off on the Skills page; the selection is kept", () => {
    skills = [skill("a", "alpha", { enabled: false })];
    links = [link("a", 0, true)];
    renderTab();
    expect(screen.getByRole("checkbox", { name: "Use alpha for this agent" })).toBeChecked();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("with no skills in the workspace, points to the Skills page", () => {
    skills = [];
    links = [];
    renderTab();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to Skills" })).toBeInTheDocument();
  });
});
