'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from '@topiadesk/ui';
import { csrfHeaders } from '@/lib/csrf';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Uploads the logo shown on THIS tenant's own Keycloak login page (see
 * infra/keycloak/themes/topiadesk/login/template.ftl's <img> tag, which
 * fetches /api/public/tenant-branding/{realm}/logo and falls back to the
 * baked-in TopiaDesk mark via onerror if unset). No separate "hasLogo"
 * flag from the API — same as the KC template itself, this just tries to
 * load the image and reacts to onError, avoiding a second round-trip only
 * to answer "does one exist".
 */
export function BrandingCard({ canWrite }: { canWrite: boolean }) {
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const [broken, setBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch('/api/admin/org-settings/branding/logo', { method: 'POST', headers: csrfHeaders('POST'), body: formData }).then((res) => {
        if (!res.ok) throw new Error('Failed to upload logo');
        return res.json();
      });
    },
    onSuccess: () => {
      toast.success('Logo updated — it will appear on your tenant’s sign-in page');
      setBroken(false);
      setCacheBust(Date.now());
    },
    onError: () => toast.error('Couldn’t upload logo — try a smaller image (max 5MB)'),
  });

  const removeLogo = useMutation({
    mutationFn: () => fetch('/api/admin/org-settings/branding/logo', { method: 'DELETE', headers: csrfHeaders('DELETE') }).then((res) => {
      if (!res.ok) throw new Error('Failed to remove logo');
      return res.json();
    }),
    onSuccess: () => {
      toast.success('Logo removed — the sign-in page will use the default TopiaDesk mark');
      setBroken(true);
    },
    onError: () => toast.error('Couldn’t remove logo'),
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Image must be 5MB or smaller');
      return;
    }
    uploadLogo.mutate(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          Sign-in page logo
        </CardTitle>
        <CardDescription>
          Shown on your tenant&apos;s own Keycloak sign-in page in place of the default TopiaDesk mark. PNG or SVG on a
          transparent background works best.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
          {broken ? (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- backend-streamed binary, not a static asset Next can optimize
            <img
              src={`/api/admin/org-settings/branding/logo?v=${cacheBust}`}
              alt=""
              className="h-full w-full object-contain p-1.5"
              onError={() => setBroken(true)}
              onLoad={() => setBroken(false)}
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadLogo.isPending}>
                {uploadLogo.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                {broken ? 'Upload logo' : 'Replace logo'}
              </Button>
              {!broken ? (
                <Button size="sm" variant="ghost" onClick={() => removeLogo.mutate()} disabled={removeLogo.isPending}>
                  <X className="h-4 w-4" aria-hidden /> Remove
                </Button>
              ) : null}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Only admins can change this.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
