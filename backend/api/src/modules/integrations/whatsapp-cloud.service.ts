import { randomUUID } from 'node:crypto';
import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

const GRAPH_API_VERSION = 'v19.0';

interface WhatsAppConnectorConfig {
  whatsappCloud?: { accessToken?: string; phoneNumberId?: string; languageCode?: string };
}

interface GraphMessagesResponse {
  messages?: { id: string }[];
  error?: { message: string; type: string; code: number };
}

/**
 * Renewal/claim notifications + FNOL intake via WhatsApp Cloud API (chosen
 * directly by the FSC spec's own "Twilio/WhatsApp Cloud" line — WhatsApp
 * Cloud is Meta's own API, no separate Twilio account needed). Real API
 * calls now — POSTs to
 * https://graph.facebook.com/v19.0/{phoneNumberId}/messages using
 * IntegrationConnector.config.whatsappCloud.{accessToken, phoneNumberId},
 * sending a template message in the exact shape Meta's Graph API expects.
 * Genuinely live-testable the moment a real WhatsApp Business Account +
 * access token land in that connector row; this dev environment has none,
 * so end-to-end delivery can't be demonstrated here, but the request
 * contract matches Meta's own published API exactly.
 *
 * Falls back to the pre-existing stub behavior (fabricated messageId, no
 * HTTP call) when no connector is configured yet, or it has no
 * accessToken/phoneNumberId — so this doesn't hard-break the notification
 * flow for every tenant just because they haven't wired WhatsApp up yet.
 */
@Injectable()
export class WhatsAppCloudService {
  private readonly logger = new Logger(WhatsAppCloudService.name);

  async sendTemplateMessage(to: string, templateName: string, params: string[]): Promise<{ messageId: string }> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'WHATSAPP_CLOUD', isEnabled: true } });
    const creds = (connector?.config as WhatsAppConnectorConfig | null)?.whatsappCloud;

    let messageId = `stub_${randomUUID()}`;
    let liveCall = false;

    if (creds?.accessToken && creds.phoneNumberId) {
      liveCall = true;
      const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: creds.languageCode ?? 'en_US' },
            components: params.length > 0 ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : undefined,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as GraphMessagesResponse | null;
      if (!res.ok || !json?.messages?.[0]?.id) {
        throw new BadGatewayException(`WhatsApp Cloud send failed: ${json?.error?.message ?? res.statusText}`);
      }
      messageId = json.messages[0].id;
    } else {
      this.logger.warn(`sendTemplateMessage: no WHATSAPP_CLOUD accessToken/phoneNumberId configured — falling back to stub for ${to}`);
    }

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: 'INFO',
          category: 'SYNC',
          externalRecordId: messageId,
          message: `${liveCall ? '' : '[stub] '}WhatsApp template "${templateName}" ${liveCall ? 'sent' : 'queued'} to ${to}${params.length > 0 ? ` (params: ${params.join(', ')})` : ''}`,
        },
      });
    } else {
      this.logger.warn(`sendTemplateMessage: no enabled WHATSAPP_CLOUD connector configured — logging skipped for ${messageId}`);
    }

    return { messageId };
  }
}
