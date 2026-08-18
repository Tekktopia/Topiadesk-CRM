'use client';

import * as React from 'react';
import { Contact2, MailWarning, Star, UserRoundX } from 'lucide-react';
import { StatsStrip } from './stats-strip';
import type { ContactStats } from '../_lib/types';

/**
 * Contact-book KPI strip.
 *
 * "Unreachable" is the tile that earns its place: a contact with neither an
 * email nor a phone number cannot be served, marketed to, or renewed with —
 * it is a data-quality defect sitting in the book, and it is invisible in a
 * table sorted by name. Anonymised contacts are counted separately rather
 * than folded into it, because those are correctly unreachable: an erasure
 * request was fulfilled and the PII is gone by design, not by neglect.
 */
export function ContactStatsStrip({ stats, isLoading }: { stats: ContactStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Contacts',
          value: stats.total.toLocaleString(),
          icon: <Contact2 aria-hidden />,
          description: `${stats.reachable.toLocaleString()} reachable`,
        },
        {
          label: 'Primary contacts',
          value: stats.primary.toLocaleString(),
          icon: <Star aria-hidden />,
          description: 'Named lead contact for their account',
        },
        {
          label: 'Unreachable',
          value: stats.unreachable.toLocaleString(),
          icon: <MailWarning aria-hidden />,
          description: stats.unreachable > 0 ? 'No email and no phone on file' : 'Everyone has a way to be contacted',
        },
        {
          label: 'Erased',
          value: stats.anonymized.toLocaleString(),
          icon: <UserRoundX aria-hidden />,
          description: stats.anonymized > 0 ? 'Anonymised under a data request' : 'No erasure requests fulfilled',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
