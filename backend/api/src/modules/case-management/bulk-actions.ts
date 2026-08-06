/**
 * requested-vs-visible diff shared by every bulk endpoint in this module —
 * mirrors crm/bulk-actions.ts exactly. `visible` is whatever a
 * `findMany({ where: { id: { in: requested } } })` under this session's RLS
 * context actually returned — anything requested but not in that set is
 * out of the caller's scope and belongs in `skipped`, not silently dropped.
 */
export function diffBulkIds(requested: string[], visible: string[]): { matched: string[]; skipped: string[] } {
  const visibleSet = new Set(visible);
  return {
    matched: requested.filter((id) => visibleSet.has(id)),
    skipped: requested.filter((id) => !visibleSet.has(id)),
  };
}
