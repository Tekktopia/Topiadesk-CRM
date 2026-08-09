import { Badge } from '@topiadesk/ui';
import type { SupportTicketPriority, SupportTicketStatus } from '../_lib/types';

const STATUS_VARIANT: Record<SupportTicketStatus, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'outline',
  WAITING_ON_TENANT: 'secondary',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

const PRIORITY_VARIANT: Record<SupportTicketPriority, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  LOW: 'secondary',
  MEDIUM: 'outline',
  HIGH: 'warning',
  URGENT: 'destructive',
};

export function TicketStatusBadge({ status }: { status: SupportTicketStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status.replace(/_/g, ' ')}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{priority}</Badge>;
}
