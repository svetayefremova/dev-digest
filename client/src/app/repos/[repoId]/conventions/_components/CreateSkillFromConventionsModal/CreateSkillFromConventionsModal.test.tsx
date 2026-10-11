import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { api } from "@/lib/api";
import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const DRAFT = {
  name: "repo-conventions",
  description: "2 house conventions extracted from payments-api",
  type: "convention",
  body: "# repo-conventions\n\n## rule-one\nRule one.",
  body_tokens: 187,
  conventions: 2,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (path: string) =>
    path === "/agents" ? [{ id: "ag1", name: "API Contract Reviewer" }] : DRAFT,
  );
  post.mockResolvedValue({ skill_id: "sk1", name: "repo-conventions", agent_ids: ["ag1"] });
});

function renderModal() {
  const handlers = { onClose: vi.fn(), onCreated: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
        <ToastProvider>
          <CreateSkillFromConventionsModal repoId="r1" repoName="payments-api" {...handlers} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return handlers;
}

describe("CreateSkillFromConventionsModal", () => {
  it("explains where the skill comes from and prefills the editable draft", async () => {
    renderModal();
    expect(await screen.findByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText("2 accepted conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2 house conventions extracted from payments-api")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Skill body" })).toHaveValue(DRAFT.body);
    expect(screen.getByText("187 tokens")).toBeInTheDocument();
  });

  it("needs an agent before it can be created", async () => {
    renderModal();
    await screen.findByDisplayValue("repo-conventions");
    const submit = screen.getByRole("button", { name: "Create skill" });
    expect(submit).toBeDisabled();
    fireEvent.click(await screen.findByRole("checkbox"));
    expect(submit).toBeEnabled();
  });

  it("saves the edited name, description and body with the chosen agents", async () => {
    const { onClose, onCreated } = renderModal();
    fireEvent.change(await screen.findByDisplayValue("repo-conventions"), { target: { value: "payments-rules" } });
    fireEvent.change(screen.getByDisplayValue(DRAFT.description), { target: { value: "House rules." } });
    fireEvent.change(screen.getByRole("textbox", { name: "Skill body" }), { target: { value: "# Edited" } });
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/repos/r1/conventions/skill", {
      name: "payments-rules",
      description: "House rules.",
      type: "convention",
      enabled: true,
      body: "# Edited",
      agent_ids: ["ag1"],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel closes without saving", async () => {
    const { onClose } = renderModal();
    await screen.findByDisplayValue("repo-conventions");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
