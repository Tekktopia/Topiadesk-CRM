import { PortalLoginForm } from './login-form';

export const metadata = {
  title: 'Sign in — Customer Portal',
};

/** Passwordless magic-link entry point — no requirePortalSession() gate
 * here (that would redirect an already-signed-in visitor right back to
 * this page in a loop); a visitor who already has a valid session and
 * navigates here anyway just gets to request another link, which is
 * harmless. */
export default function PortalLoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <PortalLoginForm />
      </div>
    </div>
  );
}
