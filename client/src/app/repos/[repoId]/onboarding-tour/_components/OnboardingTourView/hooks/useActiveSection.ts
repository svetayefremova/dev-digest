"use client";

import React from "react";
import type { OnboardingSectionKey } from "@devdigest/shared";

/** Which section is currently in view ("ON THIS PAGE" highlight). */
export function useActiveSection(keys: readonly OnboardingSectionKey[], enabled: boolean) {
  const [active, setActive] = React.useState<OnboardingSectionKey>(keys[0]!);

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = keys.find((k) => visible.has(k));
        if (first) setActive(first);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    for (const key of keys) {
      const el = document.getElementById(key);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [keys, enabled]);

  return [active, setActive] as const;
}
