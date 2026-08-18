import { Injectable, Logger } from '@nestjs/common';
import { getPrismaClient, type GraphSyncKind, type MicrosoftGraphConnection } from '@topiadesk/db';
import { loadEnv } from '@topiadesk/config';
import { decryptToken, encryptToken } from '../oauth-token-crypto';
import {
  type GraphEvent,
  type GraphMessage,
  isRemoved,
  mapEvent,
  mapMessage,
  toUpsert,
} from './graph-activity-mapper';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
/** One page of delta results; Graph caps this well below our ask anyway. */
const PAGE_SIZE = 50;
/** Refresh a little early — a token that expires mid-sync fails the whole run. */
const REFRESH_SKEW_MS = 5 * 60_000;

interface DeltaPage<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface SyncResult {
  kind: GraphSyncKind;
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

/**
 * Pulls Microsoft 365 calendar and mail into the activity timeline.
 *
 * Delta-based, not a periodic full fetch: Graph hands back a deltaLink that
 * makes every subsequent run return only what changed. That link is
 * persisted because Graph will not reissue it — losing it means resyncing a
 * whole mailbox.
 *
 * Every write goes through an upsert keyed on Activity.externalMessageId
 * (see graph-activity-mapper.ts). Delta re-delivers an item on every change
 * and webhooks can fire twice for one change, so anything less would fill
 * client timelines with duplicates.
 *
 * Direction is currently INBOUND ONLY — Outlook into TopiaDesk. Writing CRM
 * activity back out to Outlook needs conflict rules (which side wins when
 * both change) that are a product decision, not a technical default.
 */
@Injectable()
export class GraphSyncService {
  private readonly logger = new Logger(GraphSyncService.name);

  /**
   * Returns a usable access token, refreshing it first when it is at or near
   * expiry. A failed refresh flips the connection to NEEDS_RECONSENT rather
   * than throwing repeatedly — the user has to re-consent, and the UI needs
   * to be able to say so.
   */
  async getAccessToken(connection: MicrosoftGraphConnection): Promise<string | null> {
    const notExpiring = connection.expiresAt && connection.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS;
    if (notExpiring) return decryptToken(connection.encryptedAccessToken);
    if (!connection.encryptedRefreshToken) {
      await this.markNeedsReconsent(connection.id, 'No refresh token stored.');
      return null;
    }

    const env = loadEnv();
    const body = new URLSearchParams({
      client_id: env.MICROSOFT_IDP_CLIENT_ID ?? '',
      client_secret: env.MICROSOFT_IDP_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: decryptToken(connection.encryptedRefreshToken),
      scope: 'offline_access Calendars.Read Mail.Read User.Read',
    });

    const res = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_IDP_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      await this.markNeedsReconsent(connection.id, `Token refresh failed: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };

    await getPrismaClient().microsoftGraphConnection.update({
      where: { id: connection.id },
      data: {
        encryptedAccessToken: encryptToken(json.access_token),
        // Microsoft rotates refresh tokens; dropping the new one on the floor
        // would strand the connection at the next refresh.
        encryptedRefreshToken: json.refresh_token ? encryptToken(json.refresh_token) : undefined,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
        status: 'CONNECTED',
        lastSyncError: null,
      },
    });
    return json.access_token;
  }

  private async markNeedsReconsent(connectionId: string, reason: string): Promise<void> {
    await getPrismaClient().microsoftGraphConnection.update({
      where: { id: connectionId },
      data: { status: 'NEEDS_RECONSENT', lastSyncError: reason },
    });
  }

  /** Runs both enabled resources for one connection. */
  async syncConnection(connection: MicrosoftGraphConnection): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    if (connection.status === 'DISABLED') return results;

    if (connection.calendarSyncEnabled) results.push(await this.syncResource(connection, 'CALENDAR'));
    if (connection.mailSyncEnabled) results.push(await this.syncResource(connection, 'MAIL'));

    await getPrismaClient().microsoftGraphConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
    return results;
  }

  private async syncResource(connection: MicrosoftGraphConnection, kind: GraphSyncKind): Promise<SyncResult> {
    const prisma = getPrismaClient();
    const result: SyncResult = { kind, created: 0, updated: 0, removed: 0, skipped: 0 };

    const token = await this.getAccessToken(connection);
    if (!token) return result;

    const state = await prisma.graphSyncState.upsert({
      where: { connectionId_kind: { connectionId: connection.id, kind } },
      create: { connectionId: connection.id, kind },
      update: {},
    });

    // First run has no delta link, so start from the resource's delta root.
    // Calendar is windowed to the last 90 days: a producer's full calendar
    // history is noise on a client record, and the first sync of a decade-old
    // mailbox would otherwise be enormous.
    let url =
      state.deltaLink ??
      (kind === 'CALENDAR'
        ? `${GRAPH_BASE}/me/calendarView/delta?startDateTime=${new Date(Date.now() - 90 * 86_400_000).toISOString()}&endDateTime=${new Date(Date.now() + 365 * 86_400_000).toISOString()}&$top=${PAGE_SIZE}`
        : `${GRAPH_BASE}/me/messages/delta?$top=${PAGE_SIZE}`);

    let deltaLink: string | undefined;
    // Bounded: a mailbox with a very large backlog should not hold one job
    // open indefinitely — the next scheduled run resumes from the saved link.
    for (let page = 0; page < 20; page += 1) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=50' } });
      if (!res.ok) {
        const reason = `${kind} delta failed: ${res.status}`;
        this.logger.error(`[graph-sync] connection ${connection.id} ${reason}`);
        await prisma.microsoftGraphConnection.update({
          where: { id: connection.id },
          data: { lastSyncError: reason },
        });
        return result;
      }

      const body = (await res.json()) as DeltaPage<GraphEvent | GraphMessage>;
      for (const item of body.value) {
        await this.applyItem(connection, kind, item, result);
      }

      if (body['@odata.nextLink']) {
        url = body['@odata.nextLink'];
        continue;
      }
      deltaLink = body['@odata.deltaLink'];
      break;
    }

    await prisma.graphSyncState.update({
      where: { id: state.id },
      data: { deltaLink: deltaLink ?? state.deltaLink, lastRunAt: new Date() },
    });
    return result;
  }

  private async applyItem(
    connection: MicrosoftGraphConnection,
    kind: GraphSyncKind,
    item: GraphEvent | GraphMessage,
    result: SyncResult,
  ): Promise<void> {
    const prisma = getPrismaClient();
    const mapped =
      kind === 'CALENDAR'
        ? mapEvent(item as GraphEvent, connection.microsoftUpn)
        : mapMessage(item as GraphMessage, connection.microsoftUpn);

    if (!mapped) {
      result.skipped += 1;
      return;
    }

    // A meeting cancelled or an item deleted in Outlook must not linger on a
    // client's timeline as though it happened.
    if (isRemoved(item)) {
      const deleted = await prisma.activity.deleteMany({ where: { externalMessageId: mapped.externalMessageId } });
      result.removed += deleted.count;
      return;
    }

    // Only log items that involve someone the firm actually knows. Without
    // this every internal email and personal appointment in a producer's
    // mailbox would land in the CRM — the fastest way to make a timeline
    // useless and to sweep in data the firm has no business holding.
    const contact = await prisma.contact.findFirst({
      where: { email: { in: mapped.participantEmails, mode: 'insensitive' } },
      select: { id: true, accountId: true },
    });
    if (!contact) {
      result.skipped += 1;
      return;
    }

    const existing = await prisma.activity.findUnique({
      where: { externalMessageId: mapped.externalMessageId },
      select: { id: true },
    });
    await prisma.activity.upsert(toUpsert(mapped, { accountId: contact.accountId, contactId: contact.id }));
    if (existing) result.updated += 1;
    else result.created += 1;
  }
}
