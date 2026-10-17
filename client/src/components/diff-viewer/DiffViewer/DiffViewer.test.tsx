/**
 * DiffViewer — renders each file by its own FileCard. Regression guard for
 * F12 (stable `key={f.path}` instead of array index): when the file list
 * shrinks (e.g. a search/filter removing one file), the remaining file must
 * keep showing ITS OWN content, not a stale DOM node reused from whatever
 * used to sit at that index.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import type { DiffFileGroup, DiffFindingApi } from "../findings";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

afterEach(cleanup);

function renderDiff(files: PrFile[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <div data-theme="dark">
        <DiffViewer files={files} />
      </div>
    </NextIntlClientProvider>,
  );
}

function file(path: string, line: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: `@@ -1,1 +1,2 @@\n const a = 1;\n+${line}` };
}

describe("DiffViewer", () => {
  it("renders every file's own path and content", () => {
    renderDiff([file("src/a.ts", "const extra = 2;"), file("src/b.ts", "const more = 3;")]);
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();
    expect(screen.getByText("const extra = 2;")).toBeInTheDocument();
    expect(screen.getByText("const more = 3;")).toBeInTheDocument();
  });

  it("shows the empty state with no files", () => {
    renderDiff([]);
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
  });

  it("keeps the remaining file's own content when the list shrinks (filter)", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <div data-theme="dark">
          <DiffViewer files={[file("src/a.ts", "const extra = 2;"), file("src/b.ts", "const more = 3;")]} />
        </div>
      </NextIntlClientProvider>,
    );

    // Simulate a search/filter dropping the first file — only "src/b.ts" remains.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <div data-theme="dark">
          <DiffViewer files={[file("src/b.ts", "const more = 3;")]} />
        </div>
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();
    expect(screen.getByText("const more = 3;")).toBeInTheDocument();
  });

  it("renders groups in order with meta; collapsed groups open on click", () => {
    const groups: DiffFileGroup[] = [
      { id: "core", label: "Core", hint: "h", filesLabel: "1 file", findingCount: 0, color: "red", files: [file("src/a.ts", "core-line")] },
      { id: "docs", label: "Docs", hint: "h", filesLabel: "1 file", findingCount: 0, color: "red", defaultOpen: false, files: [file("README.md", "docs-line")] },
      { id: "boilerplate", label: "Boilerplate", hint: "h", filesLabel: "1 file", findingCount: 3, findingsTitle: "3 findings in 1 file", color: "red", defaultOpen: false, files: [file("package-lock.json", "lock-line")] },
    ];
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <DiffViewer files={groups.flatMap((g) => g.files)} groups={groups} />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Core", "Docs", "Boilerplate"]);
    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(screen.getByLabelText("3 findings in 1 file")).toHaveTextContent("3");
    expect(screen.getByText("core-line")).toBeInTheDocument();
    expect(screen.queryByText("docs-line")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("README.md"));
    expect(screen.getByText("docs-line")).toBeInTheDocument();

    // Accordion: the group header hides/shows its files.
    fireEvent.click(screen.getByRole("button", { name: /Core/ }));
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Core/ }));
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();

    // Expand-all opens the collapsed boilerplate file.
    const boiler = screen.getByRole("region", { name: "Boilerplate" });
    fireEvent.click(within(boiler).getByRole("button", { name: "Expand all files" }));
    expect(screen.getByText("lock-line")).toBeInTheDocument();
  });

  it("overlays findings on their line, with off-patch ones listed under the file", () => {
    const f = (id: string, start_line: number) =>
      ({ id, title: id, file: "src/a.ts", start_line, severity: "WARNING" }) as unknown as FindingRecord;
    const list = [f("on-line", 2), f("off-patch", 40)];
    const findings: DiffFindingApi = {
      byPath: new Map([["src/a.ts", list]]),
      render: (x) => <div>{`card: ${x.title}`}</div>,
      show: true,
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <DiffViewer files={[file("src/a.ts", "const b = 2;")]} findings={findings} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("img", { name: /2 finding/ })).toBeInTheDocument();
    const line = screen.getByText("const b = 2;");
    const card = screen.getByText("card: on-line");
    expect(line.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const title = screen.getByText(/outside this diff/);
    expect(within(title.parentElement as HTMLElement).getByText("card: off-patch")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("hides finding cards but keeps the severity label when show is false", () => {
    const finding = {
      id: "x", title: "x", file: "src/a.ts", start_line: 2, severity: "CRITICAL",
    } as unknown as FindingRecord;
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <DiffViewer
          files={[file("src/a.ts", "const b = 2;")]}
          findings={{ byPath: new Map([["src/a.ts", [finding]]]), render: () => <div>card</div>, show: false }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("card")).not.toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("renders a flat list without group headings when no groups are given", () => {
    renderDiff([file("src/b.ts", "x1"), file("src/a.ts", "x2")]);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    const paths = screen.getAllByText(/^src\//).map((e) => e.textContent);
    expect(paths).toEqual(["src/b.ts", "src/a.ts"]);
  });
});
