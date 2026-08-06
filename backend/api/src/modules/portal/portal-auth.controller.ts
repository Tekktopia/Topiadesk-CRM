import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { ConsumePortalLoginTokenDto, PortalSessionResponseDto, RequestPortalLoginLinkDto } from './dto/portal-auth.dto';
import { enqueuePortalLoginEmail } from './portal-login-queue';
import { generatePortalToken, hashPortalToken } from './portal-token.util';

const LOGIN_TOKEN_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 7;

/**
 * Passwordless magic-link auth for the customer portal — Contacts have no
 * password of their own. Excluded from BOTH RlsContextMiddleware (no
 * Keycloak bearer token exists here) and PortalContextMiddleware (no
 * session exists yet) in app.module.ts; every handler binds
 * SYSTEM_JOB_CONTEXT itself, same as public-knowledge.controller.ts.
 *
 * SECURITY-CRITICAL: requestLink() always returns the same generic
 * response regardless of whether the email matched a real Contact — never
 * change this to reveal match/no-match, that's a user-enumeration oracle.
 */
@ApiTags('portal')
@Controller('portal/auth')
export class PortalAuthController {
  @Post('request-link')
  @ApiOkResponse({ schema: { properties: { message: { type: 'string' } } } })
  async requestLink(@Body() dto: RequestPortalLoginLinkDto): Promise<{ message: string }> {
    const message = 'If that email is on file, we’ve sent a sign-in link.';
    await runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      // Account-side contacts only (accountId set) — carrier-side contacts
      // (underwriters) have no portal. A person who happens to be a contact
      // on more than one account gets one email per account, each carrying
      // a distinct token scoped to that one Contact/account — not a bug,
      // the same person genuinely needs to pick which org's data to see.
      const contacts = await prisma.contact.findMany({
        where: { email: { equals: dto.email, mode: 'insensitive' }, accountId: { not: null } },
        select: { id: true },
      });
      await Promise.all(
        contacts.map(async (contact) => {
          const token = generatePortalToken();
          await prisma.portalLoginToken.create({
            data: {
              contactId: contact.id,
              tokenHash: hashPortalToken(token),
              expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60_000),
            },
          });
          await enqueuePortalLoginEmail(dto.email, token);
        }),
      );
    });
    return { message };
  }

  @Post('consume')
  @ApiOkResponse({ type: PortalSessionResponseDto })
  async consume(@Body() dto: ConsumePortalLoginTokenDto): Promise<PortalSessionResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const tokenHash = hashPortalToken(dto.token);
      const loginToken = await prisma.portalLoginToken.findUnique({
        where: { tokenHash },
        include: { contact: { include: { account: { select: { name: true } } } } },
      });
      if (!loginToken || loginToken.consumedAt || loginToken.expiresAt < new Date() || !loginToken.contact.accountId) {
        throw new UnauthorizedException('This sign-in link is invalid or has expired — request a new one.');
      }

      // Sequential, not prisma.$transaction([...]) — the array/batch form is
      // incompatible with this codebase's RLS-wrapped client, which already
      // re-executes every model call inside its own interactive transaction
      // (see packages/db/src/client.ts's header comment: this was tried and
      // empirically failed with "All elements of the array need to be
      // Prisma Client promises", caught via live testing here). Not fully
      // atomic — if the session create fails after the token is marked
      // consumed, the contact just requests a new link, same degradation as
      // any other best-effort multi-step write in this codebase.
      const sessionToken = generatePortalToken();
      await prisma.portalLoginToken.update({ where: { id: loginToken.id }, data: { consumedAt: new Date() } });
      await prisma.portalSession.create({
        data: {
          contactId: loginToken.contactId,
          tokenHash: hashPortalToken(sessionToken),
          expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000),
        },
      });

      const contactName = [loginToken.contact.firstName, loginToken.contact.lastName].filter(Boolean).join(' ') || 'there';
      return { sessionToken, contactName, accountName: loginToken.contact.account?.name ?? '' };
    });
  }

  @Post('logout')
  async logout(@Headers('x-portal-session-token') token: string | undefined): Promise<{ loggedOut: boolean }> {
    if (!token) return { loggedOut: true };
    await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().portalSession.deleteMany({ where: { tokenHash: hashPortalToken(token) } }),
    );
    return { loggedOut: true };
  }
}
