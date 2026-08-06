'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Input, Label } from '@topiadesk/ui';
import { isApiErrorStatus } from '../../_lib/api';
import { useSubmitSurveyResponse } from '../../_lib/queries';

/**
 * The actual feedback form for /survey-respond/[token] — a bare score +
 * optional comment. There is no public endpoint to look up the survey's
 * question text or scale bounds by token (see page.tsx's header comment),
 * so this can't render a tailored "How satisfied were you with X?" prompt
 * or pre-set an input min/max; the score input asks the respondent to use
 * the scale mentioned in their invitation, and the backend's own
 * `score must be between {min} and {max}` validation error (surfaced
 * verbatim below on a 400) is what actually corrects a wrong guess.
 */
export function SurveyRespondForm({ responseId, respondToken }: { responseId: string; respondToken: string }) {
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const submitMutation = useSubmitSurveyResponse(responseId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsedScore = Number.parseInt(score, 10);
    if (Number.isNaN(parsedScore)) return;
    submitMutation.mutate({ respondToken, score: parsedScore, comment: comment || undefined });
  }

  if (submitMutation.isSuccess) {
    return (
      <div className="w-full rounded-none border border-border bg-card p-8 text-center shadow-brand-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Thank you for your feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your response has been recorded.</p>
      </div>
    );
  }

  const alreadySubmitted = isApiErrorStatus(submitMutation.error, 409);
  const notFound = isApiErrorStatus(submitMutation.error, 404);

  if (alreadySubmitted) {
    return (
      <div className="w-full rounded-none border border-border bg-card p-8 text-center shadow-brand-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-foreground">You&apos;ve already responded</h1>
        <p className="mt-1 text-sm text-muted-foreground">This feedback link has already been used — thank you again for your response.</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="w-full rounded-none border border-border bg-card p-8 text-center shadow-brand-sm">
        <h1 className="text-lg font-semibold text-foreground">This link is no longer valid</h1>
        <p className="mt-1 text-sm text-muted-foreground">Please contact us if you believe this is a mistake.</p>
      </div>
    );
  }

  return (
    <form className="w-full space-y-5 rounded-none border border-border bg-card p-8 shadow-brand-sm" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Share your feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">We&apos;d love to hear how we did. This only takes a moment.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="respond-score">Your rating</Label>
        <Input
          id="respond-score"
          type="number"
          inputMode="numeric"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="Enter a rating using the scale from your invitation"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="respond-comment">Comments (optional)</Label>
        <textarea
          id="respond-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      {submitMutation.isError && !alreadySubmitted && !notFound ? (
        <p className="text-sm text-destructive">{submitMutation.error instanceof Error ? submitMutation.error.message : 'Something went wrong — please try again.'}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={submitMutation.isPending || score.trim().length === 0}>
        {submitMutation.isPending ? 'Submitting…' : 'Submit feedback'}
      </Button>
    </form>
  );
}
