import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

/**
 * Renewal/claim notifications + FNOL intake via WhatsApp Cloud API (chosen
 * directly by the FSC spec's own "Twilio/WhatsApp Cloud" line — WhatsApp
 * Cloud is Meta's own API, no separate Twilio account needed). A
 * deliberate STUB — no live WhatsApp Business credentials exist in this
 * environment, so sendTemplateMessage() never makes a real HTTP call; it
 * only records the attempt. A real implementation would POST to
 * https://graph.facebook.com/v19.0/{phoneNumberId}/messages using
 * IntegrationConnector.config.whatsappCloud.accessToken.
 */
@Injectable()
export class WhatsAppCloudService {
  private readonly logger = new Logger(WhatsAppCloudService.name);

  async sendTemplateMessage(to: string, templateName: string, params: string[]): Promise<{ messageId: string }> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'WHATSAPP_CLOUD', isEnabled: true } });
    const messageId = `stub_${randomUUID()}`;

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: 'INFO',
          category: 'SYNC',
          externalRecordId: messageId,
          message: `[stub] WhatsApp template "${templateName}" queued to ${to}${params.length > 0 ? ` (params: ${params.join(', ')})` : ''}`,
        },
      });
    } else {
      this.logger.warn(`sendTemplateMessage: no enabled WHATSAPP_CLOUD connector configured — logging skipped for ${messageId}`);
    }

    return { messageId };
  }
}
