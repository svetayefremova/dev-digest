import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DocMarkdown } from "./DocMarkdown";

afterEach(cleanup);

describe("DocMarkdown", () => {
  it("SPEC-01 AC-4: renders headings and bullets as formatted Markdown", () => {
    render(<DocMarkdown>{"# Title\n\n- one\n- two"}</DocMarkdown>);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["one", "two"]);
  });

  it("SPEC-01 AC-5: raw script/HTML never becomes an element and a javascript: link is not navigable", () => {
    const { container } = render(
      <DocMarkdown>
        {"Hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click me](javascript:alert(1))"}
      </DocMarkdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const anchor = screen.getByText("click me").closest("a");
    expect(anchor?.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });
});
