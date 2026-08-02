import { NextResponse, type NextRequest } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

export const runtime = 'nodejs';

interface DocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  categoryId: string | null;
  currentVersionId: string | null;
  uploadedById: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
interface DocumentLinkRow {
  id: string;
  documentId: string;
  entityType: string;
  entityId: string;
  linkedById: string;
  linkedAt: string;
}

export interface PolicyDocumentRow extends DocumentRow {
  linkId: string;
  linkedAt: string;
}

/**
 * GET /api/policies/:id/documents — documents linked to this policy.
 * backend/api has no `GET /documents?entityType=POLICY&entityId=X` reverse
 * lookup (DocumentLink is only listable per-document, via GET
 * /documents/:id/links — see documents.controller.ts); per the build brief
 * this composes what's available rather than adding a backend endpoint:
 * GET /documents (full list) fanned out into one GET /documents/:id/links
 * call per document, filtered down to links whose entityType is POLICY and
 * entityId matches. Fine for this app's document volumes; would need a
 * real backend index if the document count grows large.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<PolicyDocumentRow[]>> {
  const { id: policyId } = await params;
  try {
    const documentsRes = await fetchApi('/documents');
    if (!documentsRes.ok) return NextResponse.json([], { status: 200 });
    const documents = (await documentsRes.json()) as DocumentRow[];

    const linkResults = await Promise.all(
      documents.map(async (doc) => {
        const res = await fetchApi(`/documents/${doc.id}/links`);
        if (!res.ok) return { doc, links: [] as DocumentLinkRow[] };
        return { doc, links: (await res.json()) as DocumentLinkRow[] };
      }),
    );

    const rows: PolicyDocumentRow[] = [];
    for (const { doc, links } of linkResults) {
      const match = links.find((l) => l.entityType === 'POLICY' && l.entityId === policyId);
      if (match) rows.push({ ...doc, linkId: match.id, linkedAt: match.linkedAt });
    }
    rows.sort((a, b) => new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime());

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) return NextResponse.json([], { status: 401 });
    console.error('[policies/:id/documents] failed', err);
    return NextResponse.json([], { status: 200 });
  }
}
