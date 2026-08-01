export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
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
