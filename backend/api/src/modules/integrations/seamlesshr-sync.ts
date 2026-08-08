import { getPrismaClient } from '@topiadesk/db';
import type { KeycloakAdminService } from '../identity/keycloak-admin.service';
import type { SeamlessHrEmployee } from './seamlesshr-client';

/** Department/Branch have no natural external key in the schema (same gap
 * upsert-record.ts documents for Account/Carrier) — resolved by exact name
 * match, generating a deterministic `code` (required + unique) for a
 * newly-created row since SeamlessHR gives us names, not TopiaDesk codes. */
function slugToCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

async function upsertDepartment(name: string): Promise<{ id: string }> {
  const prisma = getPrismaClient();
  const existing = await prisma.department.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.department.create({ data: { name, code: slugToCode(name) } });
}

async function upsertBranch(name: string): Promise<{ id: string }> {
  const prisma = getPrismaClient();
  const existing = await prisma.branch.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.branch.create({ data: { name, code: slugToCode(name) } });
}

export interface UpsertEmployeeResult {
  userId: string;
  created: boolean;
}

/**
 * Upserts one SeamlessHR employee into TopiaDesk's User table — matched by
 * email (User.email is unique, same as Keycloak's own username-by-email
 * convention this codebase already uses elsewhere, e.g.
 * createTenantAdminUser() in backend/worker). User creation is deliberately
 * Keycloak-sync-owned everywhere else in this codebase (users.controller.ts
 * has no direct POST) — this sync path is the SeamlessHR-driven equivalent
 * of that same two-system creation, using KeycloakAdminService (already
 * realm-aware via RlsContext, see that class's header comment) rather than
 * writing new Keycloak plumbing.
 */
export async function upsertSeamlessHrEmployee(employee: SeamlessHrEmployee, keycloakAdmin: KeycloakAdminService): Promise<UpsertEmployeeResult> {
  const prisma = getPrismaClient();
  const fullName = `${employee.firstName} ${employee.lastName}`.trim();

  const existing = await prisma.user.findUnique({ where: { email: employee.email } });
  const departmentId = employee.department ? (await upsertDepartment(employee.department)).id : undefined;
  const branchId = employee.branch ? (await upsertBranch(employee.branch)).id : undefined;

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { fullName, departmentId, branchId, lastSyncedAt: new Date() } });
    return { userId: existing.id, created: false };
  }

  // New employee — needs a Keycloak account before the app-DB User row can
  // reference a real keycloakSubjectId (User.keycloakSubjectId is
  // required+unique, not nullable).
  let keycloakSubjectId: string;
  const existingKeycloakUser = await keycloakAdmin.findUserByEmail(employee.email);
  if (existingKeycloakUser?.id) {
    keycloakSubjectId = existingKeycloakUser.id;
  } else {
    keycloakSubjectId = await keycloakAdmin.createUser({
      username: employee.email,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      enabled: true,
      emailVerified: true,
    });
  }

  const created = await prisma.user.create({
    data: { keycloakSubjectId, email: employee.email, fullName, departmentId, branchId, lastSyncedAt: new Date() },
  });
  return { userId: created.id, created: true };
}
