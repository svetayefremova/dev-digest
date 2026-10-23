/* DocList — filterable listbox of the repo's Markdown files. Arrow keys move
   the selection, Enter opens the focused file. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { s } from "./styles";

export interface DocListProps {
  docs: ContextDoc[];
  /** Searched folders, shown under the label. */
  roots: string;
  search: string;
  onSearch: (q: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  truncatedNotice: string | null;
  footer: string;
  refreshedAt: string;
}

export function DocList({
  docs,
  roots,
  search,
  onSearch,
  selected,
  onSelect,
  onRefresh,
  refreshing,
  truncatedNotice,
  footer,
  refreshedAt,
}: DocListProps) {
  const t = useTranslations("context");
  const [focused, setFocused] = React.useState(0);
  const refs = React.useRef<(HTMLLIElement | null)[]>([]);
  const active = Math.min(focused, Math.max(docs.length - 1, 0));

  const move = (index: number) => {
    const next = Math.max(0, Math.min(docs.length - 1, index));
    setFocused(next);
    refs.current[next]?.focus();
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div style={s.label}>{t("label")}</div>
        <div className="mono" style={s.roots}>
          {roots}
        </div>
      </div>
      <div style={s.toolbar}>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={refreshing ? t("refreshing") : t("refresh")}
          title={refreshing ? t("refreshing") : t("refresh")}
          style={s.refresh(refreshing)}
        >
          <Icon.RefreshCw size={15} />
        </button>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("filter")}
            aria-label={t("filter")}
            style={s.searchInput}
          />
        </div>
      </div>
      {truncatedNotice && <div style={s.notice}>{truncatedNotice}</div>}
      {docs.length === 0 && <div style={s.noMatch}>{t("noMatch")}</div>}
      <ul role="listbox" aria-label={t("list.label")} style={s.list}>
        {docs.map((doc, i) => (
          <li
            key={doc.path}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="option"
            aria-selected={doc.path === selected}
            aria-label={t("rowLabel", { path: doc.path, category: t(`category.${doc.category}`) })}
            tabIndex={i === active ? 0 : -1}
            onClick={() => {
              setFocused(i);
              onSelect(doc.path);
            }}
            onFocus={() => setFocused(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(i - 1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                onSelect(doc.path);
              }
            }}
            style={s.row(doc.path === selected)}
          >
            <Icon.FileText size={15} style={s.rowIcon(doc.path === selected)} />
            <span className="mono" style={s.path} title={doc.path}>
              {doc.path}
            </span>
          </li>
        ))}
      </ul>
      <div style={s.footer}>
        <span style={s.footerLine}>
          <span style={s.dot} aria-hidden="true" />
          {footer}
        </span>
        <span>{refreshedAt}</span>
      </div>
    </div>
  );
}
