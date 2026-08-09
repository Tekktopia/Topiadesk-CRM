/** Mirrors backend/api/src/modules/platform/dto/tenant.dto.ts and
 * plan.dto.ts's response shapes — kept in sync manually, same convention
 * as frontend/web's own DTO mirrors. */
export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'DELETED';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type ProvisioningStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Plan {
  id: string;
  name: string;
  seatLimit: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  plan: Plan;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  keycloakRealm: string;
  status: TenantStatus;
  primaryContactEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantProvisioningEvent {
  id: string;
  step: string;
  status: ProvisioningStepStatus;
  detail: string | null;
  occurredAt: string;
}

export interface TenantDetail extends Tenant {
  provisioningEvents: TenantProvisioningEvent[];
  subscription: Subscription | null;
}

export type PlatformAdminStatus = 'ACTIVE' | 'INACTIVE';

export interface PlatformAdmin {
  id: string;
  email: string;
  fullName: string;
  status: PlatformAdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUser {
  id: string;
  keycloakSubjectId: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface TenantAdminSummary {
  tenantId: string;
  tenantName: string;
  status: TenantStatus;
  totalUsers: number;
  adminCount: number;
  seatLimit: number | null;
}

export interface TenantUsage {
  totalUsers: number;
  activeUsers: number;
  deactivatedUsers: number;
  suspendedUsers: number;
  adminCount: number;
  planName: string | null;
  seatLimit: number | null;
}

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_TENANT' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SupportTicketComment {
  id: string;
  authorName: string;
  authorPlatformAdminId: string | null;
  body: string;
  createdAt: string;
}

export interface PlatformSupportTicket {
  id: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  raisedByName: string;
  raisedByEmail: string;
  assignedToId: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  comments?: SupportTicketComment[];
}

export interface PlatformStats {
  totalTenants: number;
  active: number;
  provisioning: number;
  suspended: number;
  failed: number;
}
