import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '@topiadesk/config';

/**
 * No mailer exists anywhere in this codebase yet (checked backend/api/src/
 * modules/notifications/ and backend/worker/src/ per the brief — Notification
 * has an EMAIL NotificationChannel value and SMTP_HOST/PORT/SECURE/FROM are
 * already validated in packages/config/src/env.ts and maildev is already a
 * running compose service, but nothing had ever actually opened an SMTP
 * connection). This is the first integration against that already-reserved
 * env contract — built in the worker because that's where this batch's only
 * email-sending requirement (scheduled report delivery) lives, matching how
 * external I/O (S3 writes, in this same batch) already lives in whichever
 * process actually needs it rather than a shared client nobody else uses
 * yet. maildev accepts unauthenticated SMTP, so no user/pass — there is no
 * SMTP_USER/SMTP_PASSWORD in the env schema, consistent with that.
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

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  attachment?: { filename: string; content: Buffer; contentType: string };
}

export async function sendMail(params: SendMailParams): Promise<void> {
  const env = loadEnv();
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    text: params.text,
    attachments: params.attachment
      ? [{ filename: params.attachment.filename, content: params.attachment.content, contentType: params.attachment.contentType }]
      : undefined,
  });
}
