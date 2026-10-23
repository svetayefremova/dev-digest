import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ContextDoc, Skill } from "@devdigest/shared";
import context from "../../../../../../../../messages/en/context.json";

const attachments: ContextAttachment[] = [
  { path: "specs/b.md", order: 0 },
  { path: "docs/a.md", order: 1 },
  { path: "insights/c.md", order: 2 },
];

const doc = (path: string, tokens: number): ContextDoc => ({
  path,
  category: "docs",
  tokens,
  size: 100,
  updated_at: "2026-10-01T00:00:00.000Z",
  previewable: true,
  used_by_agents: 0,
});
const DOCS = [doc("docs/a.md", 100), doc("insights/c.md", 40), doc("specs/b.md", 60), doc("specs/unused.md", 999)];

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useSkillContext: () => ({ data: attachments, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetSkillContext: () => ({ mutateAsync: vi.fn() }),
  useContextDocs: () => ({
    data: { cloned: true, docs: DOCS, truncated: false, total_tokens: 1199, scanned_at: "2026-10-01T00:00:00.000Z" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { SkillContextTab } from "./SkillContextTab";

const SKILL = { id: "sk1", name: "Auth rules" } as Skill;

afterEach(cleanup);

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <SkillContextTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("SkillContextTab", () => {
  it("SPEC-01 AC-29: states that agents using the skill inherit the docs and shows the attached token sum", () => {
    renderTab();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("≈ 200 tokens")).toBeInTheDocument();
  });

  it("SPEC-01 AC-30: 'Serializes as' shows '## Project context' followed by the attached paths in saved order", () => {
    renderTab();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    const pre = document.querySelector("pre")!;
    expect(pre.textContent).toBe("## Project context\nspecs/b.md\ndocs/a.md\ninsights/c.md");
  });

  it("SPEC-01 AC-53: the attachment section is titled 'Project context to use'", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
  });
});
