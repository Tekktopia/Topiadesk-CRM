import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '@topiadesk/config';

const WEBHOOK_SECRET_HEADER = 'x-keycloak-webhook-secret';

/**
 * Shared-secret check for the Keycloak sync webhook — deliberately NOT
 * PermissionGuard: the caller is Keycloak (or a thin relay in front of it),
 * not a TopiaDesk user with roles. KEYCLOAK_WEBHOOK_SECRET is now a required
 * field in packages/config's zod-validated Env (wired during the Batch 1
 * integration pass), so a missing secret fails the whole app at boot rather
 * than at first webhook call.
 *
 * No constructor-injected dependencies here, so this guard isn't subject to
 * the import-type DI footgun documented in permission.guard.ts.
 */
@Injectable()
export class KeycloakWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { KEYCLOAK_WEBHOOK_SECRET } = loadEnv();
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers[WEBHOOK_SECRET_HEADER];
    if (provided !== KEYCLOAK_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }
    return true;
  }
}
