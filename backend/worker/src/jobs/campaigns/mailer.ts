import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '@topiadesk/config';

/**
 * No mailer existed anywhere in this codebase before this module — SMTP_HOST/
 * PORT/SECURE/FROM were already required, zod-validated Env fields (see
 * packages/config/src/env.ts) and docker-compose.yml already wires them at
 * the maildev service (dev-only SMTP capture, see its comment there), but
 * nothing actually called nodemailer.createTransport with them yet. This is
 * that first real sender — genuinely end-to-end testable against maildev's
 * web UI, not a stub.
 */
let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const env = loadEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
    });
  }
  return transporter;
}

export interface SendCampaignEmailParams {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendCampaignEmailResult {
  /** nodemailer's Message-ID header value — stored on CampaignRecipient.externalMessageId so a provider webhook event can correlate back to this send. */
  messageId: string;
}

export async function sendCampaignEmail(params: SendCampaignEmailParams): Promise<SendCampaignEmailResult> {
  const env = loadEnv();
  const info = await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  return { messageId: info.messageId };
}
