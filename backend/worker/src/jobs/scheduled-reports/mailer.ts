import nodemailer, { type Transporter } from 'nodemailer';
import { decryptSecret, loadEnv } from '@topiadesk/config';
import { getPrismaClient } from '@topiadesk/db';

/**
 * Outbound SMTP.
 *
 * Transport is resolved per send, in this order:
 *   1. the current tenant's MailSettings row, when one exists and isActive
 *   2. otherwise the SMTP_* environment variables
 *
 * The env vars are process-wide and identical for every tenant, which is
 * wrong the moment one firm wants Microsoft 365 and another wants Brevo — and
 * changing them means a redeploy. The database row makes it an admin action.
 * The env path remains as the fallback so a dev stack keeps working against
 * MailDev with nothing configured, and so a misconfigured tenant degrades to
 * "the old behaviour" rather than to "no mail at all".
 *
 * Transports are cached per resolved configuration rather than globally: a
 * single cached transport would keep using the previous provider after an
 * admin switched, until the worker happened to restart.
 */
export interface SendMailParams {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  attachment?: { filename: string; content: Buffer; contentType: string };
  /** RFC 5322 threading headers — nodemailer supports these natively. */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

interface ResolvedTransport {
  key: string;
  transporter: Transporter;
  from: string;
  replyTo?: string;
}

const transportCache = new Map<string, Transporter>();

function buildTransport(key: string, options: nodemailer.TransportOptions): Transporter {
  const cached = transportCache.get(key);
  if (cached) return cached;
  const created = nodemailer.createTransport(options);
  transportCache.set(key, created);
  return created;
}

/**
 * Reads the calling tenant's mail settings. Returns null when none is active,
 * which is the signal to fall back to the environment.
 *
 * Runs under whatever RLS context the caller already bound — the notification
 * dispatcher sweeps per tenant, so this naturally resolves that tenant's row.
 */
async function resolveTenantTransport(): Promise<ResolvedTransport | null> {
  let settings;
  try {
    settings = await getPrismaClient().mailSettings.findFirst({ where: { isActive: true } });
  } catch {
    // A tenant schema predating this table must not break sending.
    return null;
  }
  if (!settings) return null;

  const password = settings.encryptedPassword ? decryptSecret(settings.encryptedPassword) : undefined;
  // The key includes `updatedAt` so editing the settings retires the cached
  // transport immediately rather than at the next worker restart.
  const key = `tenant:${settings.id}:${settings.updatedAt.getTime()}`;

  return {
    key,
    transporter: buildTransport(key, {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.username ? { user: settings.username, pass: password } : undefined,
    } as nodemailer.TransportOptions),
    from: `${settings.fromName} <${settings.fromEmail}>`,
    replyTo: settings.replyToEmail ?? undefined,
  };
}

function resolveEnvTransport(): ResolvedTransport {
  const env = loadEnv();
  const key = `env:${env.SMTP_HOST}:${env.SMTP_PORT}:${env.SMTP_USER ?? ''}`;
  return {
    key,
    transporter: buildTransport(key, {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      // Omitting auth entirely when unset (rather than sending empty-string
      // credentials) is what keeps MailDev working.
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    } as nodemailer.TransportOptions),
    from: env.SMTP_FROM,
  };
}

export async function sendMail(params: SendMailParams): Promise<void> {
  const transport = (await resolveTenantTransport()) ?? resolveEnvTransport();
  await transport.transporter.sendMail({
    from: transport.from,
    replyTo: transport.replyTo,
    to: params.to,
    cc: params.cc,
    subject: params.subject,
    text: params.text,
    messageId: params.messageId,
    inReplyTo: params.inReplyTo,
    references: params.references,
    attachments: params.attachment
      ? [{ filename: params.attachment.filename, content: params.attachment.content, contentType: params.attachment.contentType }]
      : undefined,
  });
}

/**
 * Sends through an explicit configuration without persisting it — backs the
 * admin "send test email" button, so nobody has to save and activate an
 * untested transport to find out whether it works.
 */
export async function sendMailWithConfig(
  config: { host: string; port: number; secure: boolean; username?: string; password?: string; fromName: string; fromEmail: string },
  params: SendMailParams,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
  } as nodemailer.TransportOptions);
  await transporter.sendMail({
    from: `${config.fromName} <${config.fromEmail}>`,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
}
