"use client";

import { ErrorState } from "@devdigest/ui";

/* Route-level error boundary (Next.js App Router convention). Without this,
   a render-time exception anywhere below the root layout (e.g. a malformed
   finding breaking FindingsTab's .map()) unmounts the whole tree to a blank
   white screen with no recovery UI. `reset()` re-renders the segment without
   a full page reload. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      fullScreen
      title="Something went wrong"
      body="This page hit an unexpected error. You can try again, or reload the page."
      onRetry={reset}
    />
  );
}
