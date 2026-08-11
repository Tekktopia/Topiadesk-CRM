import type { MetadataRoute } from 'next';

/**
 * Next.js's native `app/manifest.ts` convention — generates /manifest.webmanifest
 * and auto-wires the `<link rel="manifest">` tag into every page's <head>,
 * no manual tag needed. `start_url`/`scope` are relative ('/'), which is
 * deliberate for this app's subdomain-per-tenant architecture (see
 * subdomain-per-tenant routing in this codebase's identity module): a user
 * installing this PWA from `<tenant>.topiadesk.localhost` gets an install
 * scoped to THAT tenant's own origin, exactly matching how the rest of the
 * app already treats each tenant subdomain as an independent origin — a
 * single hardcoded absolute URL here would break that.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TopiaDesk CRM',
    short_name: 'TopiaDesk',
    description: 'The engagement layer for insurance brokerage operations — accounts, policies, claims, and tickets.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#147bc6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
