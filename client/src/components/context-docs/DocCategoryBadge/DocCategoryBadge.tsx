import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { DocCategory } from "@devdigest/shared";
import { CATEGORY_COLORS } from "../constants";

/** Coloured chip naming a document's category. */
export function DocCategoryBadge({ category }: { category: DocCategory }) {
  const t = useTranslations("context");
  const { color, bg } = CATEGORY_COLORS[category];
  return (
    <span aria-label={t("categoryLabel", { category: t(`category.${category}`) })}>
      <Badge color={color} bg={bg} mono>
        {t(`category.${category}`)}
      </Badge>
    </span>
  );
}
