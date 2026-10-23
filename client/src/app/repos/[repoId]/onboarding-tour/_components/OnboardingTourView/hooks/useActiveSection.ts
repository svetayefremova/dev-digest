"use client";

import React from "react";
import type { OnboardingSectionKey } from "@devdigest/shared";

/** Nearest scrolling ancestor (the shell's `<main>`), or null → the viewport. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/** Events that mean the user scrolls by hand (not our programmatic scrollIntoView). */
const USER_SCROLL_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"] as const;

/**
 * Which section is currently in view ("ON THIS PAGE" highlight).
 *
 * The band starts at the sections' own `scroll-margin-top`, measured inside the scroll
 * container, so a section scrolled to by the TOC counts as "in view" and the tail of the
 * previous section above it doesn't. `pin(key)` holds a TOC selection while the smooth scroll
 * passes other sections (and when the last, short sections can't reach the top) until the
 * user scrolls by hand.
 */
export function useActiveSection(keys: readonly OnboardingSectionKey[], enabled: boolean) {
  const [active, setActive] = React.useState<OnboardingSectionKey>(keys[0]!);
  const pinned = React.useRef<OnboardingSectionKey | null>(null);

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const first = document.getElementById(keys[0]!);
    const root = scrollParent(first);
    const marginTop = first ? parseFloat(getComputedStyle(first).scrollMarginTop) || 0 : 0;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        if (pinned.current) return;
        const top = keys.find((k) => visible.has(k));
        if (top) setActive(top);
      },
      { root, rootMargin: `-${marginTop}px 0px -60% 0px` },
    );
    for (const key of keys) {
      const el = document.getElementById(key);
      if (el) observer.observe(el);
    }

    const unpin = () => {
      if (!pinned.current) return;
      pinned.current = null;
      const top = keys.find((k) => visible.has(k));
      if (top) setActive(top);
    };
    const target: HTMLElement | Window = root ?? window;
    for (const type of USER_SCROLL_EVENTS) target.addEventListener(type, unpin, { passive: true });
    return () => {
      observer.disconnect();
      for (const type of USER_SCROLL_EVENTS) target.removeEventListener(type, unpin);
    };
  }, [keys, enabled]);

  const pin = React.useCallback((key: OnboardingSectionKey) => {
    pinned.current = key;
    setActive(key);
  }, []);

  return [active, pin] as const;
}
