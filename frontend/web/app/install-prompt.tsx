'use client';

import * as React from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@topiadesk/ui';

/**
 * Install-to-home-screen prompt for field agents.
 *
 * Two genuinely different flows, because the platforms are not symmetric:
 *
 *  - Chromium (Android/desktop) fires `beforeinstallprompt`, which we stash
 *    and replay from a real button. The event only fires when the browser
 *    already considers the app installable (manifest + SW + HTTPS + not
 *    already installed), so its arrival IS the "can install" signal — no
 *    feature-detection of our own is needed or wanted.
 *  - iOS Safari never fires that event and exposes no install API at all,
 *    so the only honest thing to offer is instructions for the Share ->
 *    "Add to Home Screen" flow. Detected by UA rather than capability
 *    because there is no capability to detect; the cost of a wrong guess
 *    is a dismissible hint, not a broken feature.
 *
 * Nothing renders once the app is already running standalone, which is the
 * reliable cross-platform "already installed" signal (iOS has no
 * `getInstalledRelatedApps`).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'topiadesk:install-prompt-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own non-standard flag — the only way to tell there.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  // Chrome/Firefox on iOS ("CriOS"/"FxiOS") can't add to the home screen at
  // all, so showing them Safari's Share-sheet steps would be a dead end.
  return iOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallPrompt(): React.ReactElement | null {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true); // assume dismissed until localStorage says otherwise, so nothing flashes on first paint

  React.useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    setDismissed(false);
    if (isIosSafari()) setShowIosHint(true);

    const onBeforeInstall = (event: Event) => {
      // Chromium shows its own mini-infobar otherwise; suppressing it is
      // what lets us place the prompt somewhere the user will actually see
      // it on a phone.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode / storage disabled — the prompt simply returns next load.
    }
  }, []);

  const install = React.useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // A dismissed prompt can't be replayed — the stashed event is single-use,
    // so drop it either way and let `appinstalled` handle the success path.
    setDeferred(null);
  }, [deferred]);

  if (dismissed) return null;
  if (!deferred && !showIosHint) return null;

  return (
    <div
      role="region"
      aria-label="Install TopiaDesk"
      className="pointer-events-auto rounded-lg border bg-card p-3 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install TopiaDesk</p>
          {showIosHint ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Share" /> in Safari, then{' '}
              <span className="font-medium">Add to Home Screen</span> — you&apos;ll be able to open your cases and renewals
              without a signal.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Add it to your home screen to open your cases and renewals without a signal.
            </p>
          )}
          {deferred ? (
            <Button size="sm" className="mt-2 gap-1.5" onClick={install}>
              <Download className="h-4 w-4" aria-hidden />
              Install
            </Button>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={dismiss} aria-label="Dismiss install prompt">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
