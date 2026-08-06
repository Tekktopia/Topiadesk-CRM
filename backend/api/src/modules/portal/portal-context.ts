export interface PortalContext {
  contactId: string;
  accountId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portalContext?: PortalContext;
    }
  }
}
