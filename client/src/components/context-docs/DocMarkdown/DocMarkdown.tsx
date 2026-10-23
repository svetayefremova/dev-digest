import React from "react";
import { Markdown } from "@devdigest/ui";

/**
 * Read-only Markdown for repo documents. The shared renderer has no raw-HTML
 * plugin (HTML never becomes elements) and react-markdown's default URL
 * transform strips `javascript:` links.
 */
export function DocMarkdown({ children }: { children?: string | null }) {
  return <Markdown skipHtml>{children}</Markdown>;
}
