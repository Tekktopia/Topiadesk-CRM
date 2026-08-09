export interface PlatformAdminContext {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPPORT' | 'SUPER_ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      platformAdmin?: PlatformAdminContext;
    }
  }
}
