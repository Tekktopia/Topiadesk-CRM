'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Powers the top header's quick-create menu (see app-header.tsx): a link to
 * `/accounts?new=1` should land on the Accounts list with its "New account"
 * dialog already open, not just the bare list. Fires `onOpen` once on
 * mount if `?new=1` is present, then strips the param via `router.replace`
 * so a later back-navigation or refresh doesn't reopen the dialog.
 */
export function useQuickCreateParam(onOpen: () => void): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current) return;
    if (searchParams.get('new') !== '1') return;
    firedRef.current = true;
    onOpen();
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onOpen is a setState setter passed inline at call sites; including it would refire on every render.
  }, [searchParams, pathname, router]);
}
