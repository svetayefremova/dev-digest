"use client";

import React from "react";
import type { OnboardingSectionKey } from "@devdigest/shared";

/** A `#section` hash in the URL → expand that section and scroll to it (once the sections exist). */
export function useSectionAnchor(
  keys: readonly OnboardingSectionKey[],
  ready: boolean,
  onReveal: (key: OnboardingSectionKey) => void,
) {
  const done = React.useRef(false);

  React.useEffect(() => {
    if (!ready || done.current) return;
    const key = keys.find((k) => k === window.location.hash.slice(1));
    done.current = true;
    if (!key) return;
    onReveal(key);
    // Wait a frame so the expanded body is in the DOM before scrolling.
    requestAnimationFrame(() => document.getElementById(key)?.scrollIntoView?.({ block: "start" }));
  }, [keys, ready, onReveal]);
}
