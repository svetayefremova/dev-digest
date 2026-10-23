import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({
  children,
  skipHtml,
  disallowedElements,
  unwrapDisallowed,
}: {
  children?: string | null;
  /** Drop raw HTML nodes instead of rendering them (forwarded to react-markdown). */
  skipHtml?: boolean;
  /** Element names to drop (forwarded to react-markdown), e.g. ["img", "a"]. */
  disallowedElements?: string[];
  /** Keep the children of dropped elements as plain content instead of removing them. */
  unwrapDisallowed?: boolean;
}) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml={skipHtml}
        disallowedElements={disallowedElements}
        unwrapDisallowed={unwrapDisallowed}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
