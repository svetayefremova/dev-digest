import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../../messages/en/shell.json";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/repos/r1/onboarding-tour",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children?: React.ReactNode;
    "aria-current"?: "page";
  }) => (
    <a href={href} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    repos: [{ id: "r1", full_name: "acme/payments-api", default_branch: "main", last_polled_at: null }],
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main", last_polled_at: null },
    setRepoId: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: undefined }),
  useDeleteRepo: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));

afterEach(cleanup);

function renderShell() {
  render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <AppShell>
        <div>page body</div>
      </AppShell>
    </NextIntlClientProvider>,
  );
}

/** The nav label span; its parent is the styled item row. */
const label = (name: string) => screen.getByText(name, { selector: "span" });
const link = (name: string) => label(name).closest("a")!;

describe("AppShell sidebar", () => {
  it("SPEC-02 AC-1: lists Onboarding Tour after Pull Requests and before Project Context in the Workspace group", () => {
    renderShell();
    const pulls = link("Pull Requests");
    const tour = link("Onboarding Tour");
    const context = link("Project Context");
    expect(pulls.compareDocumentPosition(tour) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tour.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SPEC-02 AC-2: the Onboarding Tour tab links to the selected repo's tour and is the only active tab on its page", () => {
    renderShell();
    expect(link("Onboarding Tour")).toHaveAttribute("href", "/repos/r1/onboarding-tour");
    // The active tab exposes its state to assistive technology; neighbours do not.
    expect(link("Onboarding Tour")).toHaveAttribute("aria-current", "page");
    expect(link("Pull Requests")).not.toHaveAttribute("aria-current");
    expect(link("Project Context")).not.toHaveAttribute("aria-current");
  });
});
