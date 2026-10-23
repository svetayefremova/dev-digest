"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface BannerAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
}

/** Reason / error / notice banner with optional actions (Retry, Re-analyze, Regenerate). */
export function TourBanner({
  tone,
  message,
  actions = [],
  role,
}: {
  tone: "warn" | "info" | "crit";
  message: string;
  actions?: BannerAction[];
  role?: "alert" | "status";
}) {
  return (
    <div style={s.banner(tone)} role={role}>
      <span>{message}</span>
      {actions.length > 0 && (
        <span style={s.actions}>
          {actions.map((action) => (
            <Button key={action.label} size="sm" kind="secondary" onClick={action.onClick} loading={action.loading}>
              {action.label}
            </Button>
          ))}
        </span>
      )}
    </div>
  );
}
