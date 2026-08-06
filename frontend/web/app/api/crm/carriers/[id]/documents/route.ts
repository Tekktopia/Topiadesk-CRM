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
  currentVersion: { versionNumber: number } | null;
}
interface DocumentLinkRow {
  id: string;
  documentId: string;
  entityType: string;
  entityId: string;
  linkedById: string;
  linkedAt: string;
}

export interface CarrierDocumentRow extends DocumentRow {
  linkId: string;
  linkedAt: string;
}

/**
 * GET /api/crm/carriers/:id/documents — documents linked to this carrier.
 * Same composition approach as app/api/policies/:id/documents/route.ts
 * (that route's own header comment explains why: backend/api has no
 * `GET /documents?entityType=X&entityId=Y` reverse lookup, only
 * per-document `GET /documents/:id/links`, so this fans that out across
 * every document and filters down client-side. Same acknowledged
 * scaling caveat as that route — fine at this app's document volumes.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<CarrierDocumentRow[]>> {
  const { id: carrierId } = await params;
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

    const rows: CarrierDocumentRow[] = [];
    for (const { doc, links } of linkResults) {
      const match = links.find((l) => l.entityType === 'CARRIER' && l.entityId === carrierId);
      if (match) rows.push({ ...doc, linkId: match.id, linkedAt: match.linkedAt });
    }
    rows.sort((a, b) => new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime());

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) return NextResponse.json([], { status: 401 });
    console.error('[crm/carriers/:id/documents] failed', err);
    return NextResponse.json([], { status: 200 });
  }
}
