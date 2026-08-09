import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, LifeBuoy, ShieldCheck, UsersRound } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';

export const metadata = {
  title: 'Welcome',
};

interface Destination {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof LifeBuoy;
  /** External (different subdomain, e.g. Global Admin) links use a plain <a> — Next.js's <Link> prefetches and client-navigates, both wrong for a cross-origin destination. */
  external?: boolean;
}

/**
 * The app's public entry point — see middleware.ts's header comment for why
 * this exists (an anonymous visitor to "/" sees this instead of being
 * bounced straight into the Staff CRM's Keycloak login) and why an already-
 * authenticated visitor never actually sees it (redirected to /dashboard
 * before this renders). Deliberately a Server Component with no
 * interactivity beyond plain links — `headers()` below opts this out of
 * static generation, which is fine (and in fact necessary) since the
 * Global Admin card's href is derived from the current request's actual
 * host rather than a hardcoded domain, so it resolves correctly in any
 * environment (local `*.topiadesk.localhost`, staging, production) without
 * a dedicated env var.
 */
export default async function EntryChooserPage() {
  const host = (await headers()).get('host') ?? '';
  const globalAdminHref = `https://${host.replace(/^app\./, 'platform.')}`;

  const destinations: Destination[] = [
    {
      key: 'staff',
      label: 'Staff CRM',
      description: 'Client and policy engagement, cases, pipeline, and reporting for TopiaDesk staff.',
      href: '/dashboard',
      icon: LifeBuoy,
    },
    {
      key: 'portal',
      label: 'Customer Portal',
      description: 'View your policies, track a claim, and message your broker.',
      href: '/portal',
      icon: UsersRound,
    },
    {
      key: 'kb',
      label: 'Knowledge Base',
      description: 'Browse help articles and policy FAQs — no account needed.',
      href: '/kb',
      icon: BookOpen,
    },
    {
      key: 'global-admin',
      label: 'Global Admin',
      description: 'Tenant provisioning and platform operations — TopiaDesk operators only.',
      href: globalAdminHref,
      icon: ShieldCheck,
      external: true,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="flex w-full max-w-3xl flex-col items-center">
        <Image src="/logo-mark.png" alt="" width={44} height={44} className="mb-4" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">TopiaDesk</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">Choose where you&rsquo;d like to go.</p>

        <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {destinations.map((dest) => {
            const Icon = dest.icon;
            const content = (
              <Card className="group h-full transition-all hover:border-primary/50 hover:shadow-md">
                <CardContent className="flex h-full items-start gap-4 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{dest.label}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{dest.description}</p>
                  </div>
                </CardContent>
              </Card>
            );

            return dest.external ? (
              <a key={dest.key} href={dest.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
                {content}
              </a>
            ) : (
              <Link key={dest.key} href={dest.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
                {content}
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">&copy; {new Date().getFullYear()} TopiaDesk CRM</p>
      </div>
    </div>
  );
}
