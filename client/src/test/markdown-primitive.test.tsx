import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown } from "@devdigest/ui";

afterEach(cleanup);

describe("Markdown primitive (vendored)", () => {
  it("RQ59: by default (no disallowed props) a Markdown link still renders as a link with its href", () => {
    render(<Markdown>{"See [docs](https://example.com/docs) now"}</Markdown>);

    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
  });

  it("RQ59: disallowedElements with unwrapDisallowed drops the link element but keeps its text", () => {
    render(
      <Markdown disallowedElements={["a"]} unwrapDisallowed>
        {"See [docs](https://example.com/docs) now"}
      </Markdown>,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/See docs now/)).toBeInTheDocument();
  });
});
