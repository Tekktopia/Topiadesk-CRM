/**
 * Cookie names + timing constants shared between `session.ts` (Node
 * runtime — Route Handlers/Server Actions, uses `next/headers`) and
 * `middleware.ts` (Edge runtime, uses `NextRequest`/`NextResponse`
 * cookies directly). Deliberately zero-dependency so importing it from
 * middleware never risks pulling in a Node-only module transitively.
 */
export const SESSION_COOKIE_NAME = 'td_session';
export const OAUTH_TXN_COOKIE_NAME = 'td_oauth_txn';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // outer envelope only — actual expiry is enforced via token fields
export const OAUTH_TXN_MAX_AGE_SECONDS = 60 * 5;

/** Access tokens are refreshed proactively once fewer than this many
 * seconds remain, so a request never races an about-to-expire token. */
export const REFRESH_SKEW_SECONDS = 30;
