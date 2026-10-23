"use client";

import React from "react";
import type { ViewKind } from "../helpers";

/**
 * When the empty state's CTA unmounts (generation started), focus moves to Regenerate (AC-45).
 * `null` means the state is still loading: it is never treated as "empty", so the first load of
 * an existing tour doesn't steal focus. Only a rendered empty state → another view moves it.
 */
export function useFocusOnLeaveEmpty(kind: ViewKind | null, target: React.RefObject<HTMLButtonElement | null>) {
  const prev = React.useRef(kind);
  React.useEffect(() => {
    if (kind === null) return;
    if (prev.current === "empty" && kind !== "empty") target.current?.focus();
    prev.current = kind;
  }, [kind, target]);
}
