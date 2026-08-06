import { AuthConsumeView } from './auth-consume-view';

export const metadata = {
  title: 'Signing in — Customer Portal',
};

export default async function PortalAuthConsumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <AuthConsumeView token={token} />
      </div>
    </div>
  );
}
