/** Cookie name for the customer portal session — deliberately separate
 * namespace from `lib/auth/constants.ts`'s `td_session` (internal staff). */
export const PORTAL_SESSION_COOKIE_NAME = 'portal_session';

/** Matches SESSION_TTL_DAYS in backend/api's portal-auth.controller.ts —
 * kept in sync manually since the two are independently deployable apps. */
export const PORTAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
