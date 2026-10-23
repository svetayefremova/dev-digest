import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingFirstTask } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { FirstTasks } from "./FirstTasks";

afterEach(cleanup);

const task = (title: string, complexity: OnboardingFirstTask["complexity"], importers: number): OnboardingFirstTask => ({
  title,
  path: `src/${title.toLowerCase().replace(/\s+/g, "-")}.ts`,
  isDirectory: false,
  importers,
  complexity,
});

function renderTasks(tasks: OnboardingFirstTask[] | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <FirstTasks tasks={tasks} placeholder={false} />
    </NextIntlClientProvider>,
  );
}

describe("FirstTasks", () => {
  it("SPEC-02 AC-17: each card carries its Low / Medium / High complexity badge", () => {
    renderTasks([task("Add a health check", "low", 2), task("Wire retries", "medium", 7), task("Split the router", "high", 15)]);
    expect(screen.getByText("Low complexity")).toBeInTheDocument();
    expect(screen.getByText("Medium complexity")).toBeInTheDocument();
    expect(screen.getByText("High complexity")).toBeInTheDocument();
  });

  it("SPEC-02 AC-52: cards are informational: no Open button or link, and clicking a card changes nothing", () => {
    const { container } = renderTasks([task("Add a health check", "low", 2)]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Open")).not.toBeInTheDocument();

    const before = container.innerHTML;
    fireEvent.click(screen.getByText("Add a health check"));
    expect(container.innerHTML).toBe(before);
  });

  it("SPEC-02 AC-26: a skeleton (no tasks) shows 'Available once the AI summary is generated'", () => {
    renderTasks(null);
    expect(screen.getByText("Available once the AI summary is generated")).toBeInTheDocument();
  });
});
