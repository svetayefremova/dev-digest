import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";
import { pickFocusFindings } from "./helpers";

afterEach(cleanup);

const f = (over: Partial<FindingRecord>): FindingRecord =>
  ({
    id: over.id ?? "f",
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  }) as FindingRecord;

describe("pickFocusFindings", () => {
  it("keeps open CRITICAL then WARNING findings, drops suggestions/dismissed/trifecta", () => {
    const out = pickFocusFindings([
      f({ id: "w", severity: "WARNING", file: "src/b.ts" }),
      f({ id: "s", severity: "SUGGESTION" }),
      f({ id: "c", severity: "CRITICAL", file: "src/z.ts" }),
      f({ id: "d", severity: "CRITICAL", dismissed_at: "2026-10-16" }),
      f({ id: "lt", severity: "CRITICAL", kind: "lethal_trifecta" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["c", "w"]);
  });
});

describe("ReviewFocus", () => {
  it("renders file:line links to the PR head and the finding title", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <ReviewFocus
          findings={[f({ id: "c", severity: "CRITICAL", file: "src/config.ts", start_line: 12, end_line: 12, title: "live key committed" })]}
          repoFullName="acme/api"
          headSha="abc"
        />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link", { name: "src/config.ts:12" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/blob/abc/src/config.ts#L12");
    expect(screen.getByText(/live key committed/)).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to focus on", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <ReviewFocus findings={[f({ severity: "SUGGESTION" })]} repoFullName={null} headSha="abc" />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
