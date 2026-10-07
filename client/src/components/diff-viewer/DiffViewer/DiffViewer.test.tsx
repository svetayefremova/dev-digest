/**
 * DiffViewer — renders each file by its own FileCard. Regression guard for
 * F12 (stable `key={f.path}` instead of array index): when the file list
 * shrinks (e.g. a search/filter removing one file), the remaining file must
 * keep showing ITS OWN content, not a stale DOM node reused from whatever
 * used to sit at that index.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
});
