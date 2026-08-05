/**
 * Client-side flat-list-to-tree walk for CaseCategory/LossCauseCategory —
 * both got a self-relation `parentId`/`parent`/`children` added to
 * packages/db/prisma/schema.prisma, but case-categories.controller.ts /
 * loss-cause-categories.controller.ts deliberately keep list responses flat
 * (no nested-tree endpoint), same convention as
 * app/(knowledge)/_lib/category-tree.ts's KnowledgeCategory tree (see that
 * file's header comment: "clients build the tree client-side from the flat
 * list"). Generic over any row shaped like `{ id, name, parentId }` so one
 * implementation serves both CaseCategory and LossCauseCategory.
 */
export interface CategoryTreeRow<T> {
  category: T;
  depth: number;
}

export function buildCategoryTree<T extends { id: string; name: string; parentId: string | null }>(categories: T[]): CategoryTreeRow<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const category of categories) {
    const key = category.parentId;
    const siblings = byParent.get(key) ?? [];
    siblings.push(category);
    byParent.set(key, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name));
  }

  const rows: CategoryTreeRow<T>[] = [];
  // Cap depth defensively — a malformed/cyclic parentId chain (shouldn't
  // happen — the form dialogs exclude a category's own descendants from
  // its parent picker, and the controller rejects direct self-parenting —
  // but this builds client-side from user-editable data) should degrade to
  // a flat-ish list rather than recurse forever.
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

export function categoryLabel<T extends { name: string }>(row: CategoryTreeRow<T>): string {
  return `${'— '.repeat(row.depth)}${row.category.name}`;
}

/** All descendant ids of `id` (not including `id` itself) — used by each form dialog's parent picker to exclude a category's own descendants (cycle prevention). */
export function descendantsOf<T extends { id: string; parentId: string | null }>(id: string, all: T[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    const siblings = children.get(c.parentId) ?? [];
    siblings.push(c.id);
    children.set(c.parentId, siblings);
  }
  const result = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || result.has(next)) continue;
    result.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return result;
}
