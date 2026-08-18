/**
 * Client-side fetch helper for app/(compliance)/**'s TanStack Query hooks —
 * same shape as every other route group's own copy (app/(crm)/_lib/api.ts,
 * app/(admin)/admin/_lib/api.ts), not a shared import, matching this
 * codebase's established per-route-group convention.
 */
import { csrfHeaders } from '@/lib/csrf';

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
  } catch {
    // response body wasn't JSON — fall through to the generic message
  }
  return `Request failed (${res.status})`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders(init?.method), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new ApiRequestError(await parseErrorMessage(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
