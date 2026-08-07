/**
 * Cookie names + timing constants — see frontend/web/lib/auth/constants.ts
 * for the full reasoning (shared between session.ts's Node runtime and
 * middleware.ts's Edge runtime). Cookie names are deliberately DIFFERENT
 * from frontend/web's (`td_session`/`td_oauth_txn`) — the two apps may
 * eventually share a parent cookie domain (WEB_COOKIE_DOMAIN), and a
 * platform-admin session cookie must never be confusable with (or
 * overwrite) a tenant-user one.
 */
export const SESSION_COOKIE_NAME = 'gadmin_session';
export const OAUTH_TXN_COOKIE_NAME = 'gadmin_oauth_txn';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const OAUTH_TXN_MAX_AGE_SECONDS = 60 * 5;
export const REFRESH_SKEW_SECONDS = 30;
