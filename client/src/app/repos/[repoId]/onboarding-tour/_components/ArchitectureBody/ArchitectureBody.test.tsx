import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { ArchitectureBody } from "./ArchitectureBody";

afterEach(cleanup);

function renderBody(summary: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <ArchitectureBody
        architecture={{ summary, diagram: null, stack: [], topLevelDirs: [] }}
        placeholder={false}
      />
    </NextIntlClientProvider>,
  );
}

describe("ArchitectureBody", () => {
  it("RQ59: model Markdown with an image, a link and raw <img> renders no img and no a element, and keeps the link text", () => {
    const { container } = renderBody(
      "Intro ![x](https://evil.example/p.png) and [click](https://evil.example) then <img src=x> end",
    );

    expect(screen.getByText(/Intro/)).toBeInTheDocument();
    expect(screen.getByText(/click/)).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
