import { SurveyRespondForm } from './survey-respond-form';

export const metadata = {
  title: 'Share your feedback',
};

/**
 * Public, unauthenticated survey response page — reached only via an
 * emailed/SMS'd link, never app navigation (no nav.ts entry). Excluded from
 * middleware.ts's session-cookie redirect gate (see that file's `config`
 * comment) so an external contact with no TopiaDesk session can load it.
 *
 * Backend's public endpoint is `POST /surveys/responses/:id/submit` with
 * `{ respondToken, score, comment? }` in the body (survey-responses.controller.ts)
 * — the response row's id and its respondToken are two separate values, and
 * there is no lookup-by-token-alone endpoint (respondToken is deliberately
 * never returned by any read endpoint — SurveyResponseRecordDto's header
 * comment). The actual "send a survey link" dispatch (Case resolution ->
 * CSAT, etc.) isn't built yet — SurveysService's header comment flags it as
 * a future caller — so no real link format exists to match yet. This page
 * picks the simplest self-consistent option: a single opaque `[token]`
 * segment of the form `{responseId}.{respondToken}`, split apart here. If
 * the real dispatch flow lands with a different shape, only this parsing
 * needs to change — the form/BFF contract below stays the same.
 */
export default async function SurveyRespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const separatorIndex = token.indexOf('.');
  const responseId = separatorIndex > 0 ? token.slice(0, separatorIndex) : null;
  const respondToken = separatorIndex > 0 ? token.slice(separatorIndex + 1) : null;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center">
      {responseId && respondToken ? (
        <SurveyRespondForm responseId={responseId} respondToken={respondToken} />
      ) : (
        <InvalidLink />
      )}
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-8 text-center shadow-brand-sm">
      <h1 className="text-lg font-semibold text-foreground">This feedback link looks incomplete</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Please use the full link from the original email or message — it may have been cut off when copied.
      </p>
    </div>
  );
}
