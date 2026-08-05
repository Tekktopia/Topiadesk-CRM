import { KbListView } from './kb-list-view';

export const metadata = {
  title: 'Help Center',
};

/**
 * Public, unauthenticated knowledge base portal — lists PUBLISHED articles
 * whose `visibility` is CUSTOMER (KnowledgeArticleVisibility), the field
 * this route exists to finally give a real reader. Reached by anonymous
 * external visitors (e.g. a Scib Nigeria customer looking up a policy FAQ),
 * never by app navigation — like /survey-respond/[token], this route has no
 * nav.ts entry (see ../nav.ts's header comment on that same convention).
 *
 * Excluded from middleware.ts's session-cookie redirect gate (see that
 * file's `config` comment) so a visitor with no `td_session` cookie can
 * load it. Data comes from the BFF proxies under
 * app/api/public/knowledge/**, which forward to the backend's
 * public/knowledge/* endpoints (public-knowledge.controller.ts) — no
 * Authorization header on either hop.
 *
 * Renders shell-free — no AppSidebar/AppHeader — via app/app-shell.tsx,
 * which checks the pathname against the same public prefixes middleware.ts
 * excludes. Keep both lists in sync if this route ever moves.
 */
export default function KnowledgeBasePortalPage() {
  return <KbListView />;
}
