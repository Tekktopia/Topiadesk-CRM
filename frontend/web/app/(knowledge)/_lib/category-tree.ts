import type { KnowledgeCategory } from './types';

/**
 * The backend keeps the category hierarchy flat (parentCategoryId is a bare
 * self-referential FK, no nested-tree endpoint — see
 * knowledge-categories.controller.ts's header comment: "clients build the
 * tree client-side from the flat list"). This walks that flat list into a
 * depth-first, parent-before-children order with a `depth` for indentation —
 * everything a <select> or table needs, without a recursive tree component.
 */
export interface CategoryTreeRow {
  category: KnowledgeCategory;
  depth: number;
}

export function buildCategoryTree(categories: KnowledgeCategory[]): CategoryTreeRow[] {
  const byParent = new Map<string | null, KnowledgeCategory[]>();
  for (const category of categories) {
    const key = category.parentCategoryId;
    const siblings = byParent.get(key) ?? [];
    siblings.push(category);
    byParent.set(key, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  const rows: CategoryTreeRow[] = [];
  // Cap depth defensively — a malformed/cyclic parentCategoryId chain
  // (shouldn't happen, but this builds client-side from user-editable data)
  // should degrade to a flat-ish list rather than recurse forever.
  const MAX_DEPTH = 20;
  function visit(parentId: string | null, depth: number): void {
    if (depth > MAX_DEPTH) return;
    for (const category of byParent.get(parentId) ?? []) {
      rows.push({ category, depth });
      visit(category.id, depth + 1);
    }
  }
  visit(null, 0);

  // Any row whose parent went missing (deleted, or a genuine cycle) still
  // needs to be visible somewhere rather than silently vanishing.
  const visitedIds = new Set(rows.map((r) => r.category.id));
  for (const category of categories) {
    if (!visitedIds.has(category.id)) rows.push({ category, depth: 0 });
  }
  return rows;
}

export function categoryLabel(row: CategoryTreeRow): string {
  return `${'— '.repeat(row.depth)}${row.category.name}`;
}
