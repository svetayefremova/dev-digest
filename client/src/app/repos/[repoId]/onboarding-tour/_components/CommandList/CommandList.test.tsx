import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { CommandList } from "./CommandList";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type RunLocally = OnboardingTour["runLocally"];

function renderList(runLocally: RunLocally, notice?: string) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <CommandList runLocally={runLocally} notice={notice} />
    </NextIntlClientProvider>,
  );
}

describe("CommandList", () => {
  it("SPEC-02 AC-43: copying 'pnpm dev # http://localhost:3000' puts 'pnpm dev' on the clipboard and announces 'Copied'", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderList({
      commands: [{ command: "pnpm dev # http://localhost:3000", comment: null, source: "package_script" }],
      envVars: [],
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: /copy command/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copied"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("pnpm dev");
  });

  it("SPEC-02 AC-18: with no run facts it shows 'No run instructions found in this repo' and no commands to copy", () => {
    renderList({ commands: [], envVars: [] });
    expect(screen.getByText("No run instructions found in this repo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy command/i })).not.toBeInTheDocument();
  });

  it("SPEC-02 AC-31: the no-supported-files notice is shown together with the detected run commands", () => {
    renderList(
      { commands: [{ command: "make build", comment: null, source: "package_script" }], envVars: ["DATABASE_URL"] },
      "No supported source files indexed (.ts, .tsx, .js, .jsx, .mjs, .cjs)",
    );
    expect(screen.getByText(/No supported source files indexed/)).toBeInTheDocument();
    expect(screen.getByText("make build")).toBeInTheDocument();
    expect(screen.getByText("DATABASE_URL")).toBeInTheDocument();
    expect(screen.queryByText("No run instructions found in this repo")).not.toBeInTheDocument();
  });
});
