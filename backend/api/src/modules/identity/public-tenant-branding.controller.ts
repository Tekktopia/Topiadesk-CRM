import { Readable } from 'node:stream';
import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { getMinioClient, documentsBucket } from '../documents/minio-client';

/**
 * Fetched by an anonymous browser rendering the Keycloak login page
 * (infra/keycloak/themes/topiadesk/login/template.ftl's <img src>, keyed
 * by ${realm.name} — the one thing the login theme reliably knows about
 * itself before any authentication happens) — no session exists yet, so
 * this can't be gated by RlsContext the normal way, same reasoning as
 * omnichannel/live-chat.controller.ts. Excluded from RlsContextMiddleware
 * in app.module.ts alongside that controller and the other public/*
 * routes. 404s (not a redirect to a default image) when no tenant/no logo
 * is found — the FTL template's own `onerror` handler is what falls back
 * to the baked-in TopiaDesk mark, keeping "what the default looks like" a
 * theme concern, not a backend one. Streaming shape copied verbatim from
 * IdentityController.getMyAvatar (identity.controller.ts).
 */
@ApiTags('identity')
@Controller('public/tenant-branding')
export class PublicTenantBrandingController {
  @Get(':realmName/logo')
  async logo(@Param('realmName') realmName: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().tenant.findFirst({ where: { keycloakRealm: realmName }, select: { logoStorageKey: true } }),
    );
    if (!tenant?.logoStorageKey) throw new NotFoundException('No logo set for this realm');

    const result = await getMinioClient().send(new GetObjectCommand({ Bucket: documentsBucket(), Key: tenant.logoStorageKey }));
    if (!result.Body) throw new NotFoundException('Logo missing from storage');

    res.set({
      'Content-Type': result.ContentType ?? 'application/octet-stream',
      // Public and cacheable by any intermediary — this is the same bytes
      // for every anonymous visitor to this realm's login page, unlike the
      // authenticated preview in tenant-branding.controller.ts.
      'Cache-Control': 'public, max-age=3600',
      // Defense-in-depth alongside assertSafeImageMimeType's upload-time
      // SVG rejection (image-mimetype.util.ts) — stops the browser from
      // MIME-sniffing stored bytes into something more dangerous than the
      // declared Content-Type, for any row written before that check
      // existed.
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(result.Body as Readable);
  }
}
