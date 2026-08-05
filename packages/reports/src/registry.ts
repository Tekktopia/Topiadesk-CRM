import { ReportRegistry } from './report-definition';
import { ALL_REPORT_DEFINITIONS } from './definitions';

/**
 * One registry instance per process, built once from the fixed list of
 * definitions above — both backend/api (interactive /reports/* endpoints)
 * and backend/worker (scheduled dispatch) call this to get the exact same
 * set of report keys, so there is no drift between what the catalog
 * advertises and what a scheduled report can actually run.
 */
export function buildDefaultRegistry(): ReportRegistry {
  const registry = new ReportRegistry();
  for (const definition of ALL_REPORT_DEFINITIONS) registry.register(definition);
  return registry;
}
