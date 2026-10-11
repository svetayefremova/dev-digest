import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const push = vi.fn();

// Mock the data hooks and the router so the tab renders without a network/query client.
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ConfigTab } from "./ConfigTab";

beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SKILL: Skill = {
  id: "sk1",
  name: "uncovered-branches",
  description: "Flag each new branch no test exercises.",
  type: "rubric",
  source: "manual",
  body: "# Uncovered branches\n\nFlag them.",
  enabled: true,
  version: 3,
  body_tokens: 9,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const body = () => screen.getByRole("textbox", { name: "Skill body" });
const saveButton = () => screen.getByRole("button", { name: "Save skill" });

describe("skill ConfigTab", () => {
  it("shows the saved skill: file name, exact token count, nothing unsaved", () => {
    renderTab();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("uncovered-branches.md")).toBeInTheDocument();
    expect(screen.getByText("9 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("marks the body unsaved on edit and switches the token count to an estimate", () => {
    renderTab();
    // 40 characters → 10 tokens at 4 chars per token.
    fireEvent.change(body(), { target: { value: "x".repeat(40) } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("≈ 10 tokens")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("Cancel drops the edit and the unsaved badge", () => {
    renderTab();
    fireEvent.change(body(), { target: { value: "# Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(body()).toHaveValue(SKILL.body);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByText("9 tokens")).toBeInTheDocument();
  });

  it("saves the edited body together with the What changed note", () => {
    renderTab();
    fireEvent.change(body(), { target: { value: "# Changed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "What changed" }), {
      target: { value: "  Tightened the rule  " },
    });
    fireEvent.click(saveButton());
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(
      {
      id: "sk1",
      patch: {
        name: "uncovered-branches",
        description: "Flag each new branch no test exercises.",
        type: "rubric",
        body: "# Changed",
        message: "Tightened the rule",
      },
      },
      expect.anything(),
    );
  });

  it("sends no message when the note is empty, so the server writes its default", () => {
    renderTab();
    fireEvent.change(body(), { target: { value: "# Changed" } });
    fireEvent.click(saveButton());
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.lastCall?.[0].patch).not.toHaveProperty("message");
  });

  it("deletes only after confirmation, then returns to the list", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(deleteMutate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
    act(() => deleteMutate.mock.lastCall?.[1].onSuccess());
    expect(push).toHaveBeenCalledWith("/skills");
  });
});
