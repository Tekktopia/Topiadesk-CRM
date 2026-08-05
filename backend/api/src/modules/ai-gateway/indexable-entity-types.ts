/**
 * The ONLY entityType values POST /ai/index and /ai/search accept.
 *
 * `semantic_embeddings_rw` (packages/db/prisma/rls/002_policies.sql) has an
 * explicit CASE branch for 'account' and 'knowledge_article' that scopes
 * visibility by joining back to each entity's own RLS rule; anything else
 * falls into its ELSE branch, which requires ALL-scope
 * `semantic_embedding:read`/`write` — i.e. writing (or reading) any other
 * entityType through the normal caller-scoped RLS session would silently
 * fail for everyone except an ALL-scope role. Restricting this API to the
 * two entityTypes the policy actually reasons about per-record keeps every
 * semantic-search write inside the RLS coverage it was designed for — see
 * the schema.prisma header comment above the semantic_embeddings_rw policy
 * ("Extend the CASE below whenever a new entityType starts being embedded")
 * for how to add a third one later.
 */
export const INDEXABLE_ENTITY_TYPES = ['account', 'knowledge_article'] as const;
export type IndexableEntityType = (typeof INDEXABLE_ENTITY_TYPES)[number];
