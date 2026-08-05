export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  presenceStatus: 'ONLINE' | 'AWAY' | 'OFFLINE';
  roles: string[];
  /**
   * Role UUIDs (roles.id), alongside `roles`' names — added for
   * IpWhitelistGuard (backend/api/src/modules/identity/ip-whitelist.guard.ts),
   * which matches the caller's roles against IpWhitelistEntry.appliesToRoleId
   * (a Role FK, not a name). Purely additive to this interface — every
   * existing consumer that only reads `roles`/other fields is unaffected.
   */
  roleIds: string[];
  departmentId: string | null;
  branchId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
