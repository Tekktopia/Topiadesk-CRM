export interface PortalMe {
  contactName: string;
  accountName: string;
}

export interface PortalPolicy {
  id: string;
  policyNumber: string;
  lineOfBusiness: string;
  status: string;
  sumInsured: string | null;
  currency: string;
  inceptionDate: string;
  expiryDate: string;
}

export interface PortalCase {
  id: string;
  caseNumber: string;
  caseType: string;
  subject: string;
  description?: string | null;
  status: string;
  createdAt: string;
}

export interface PortalCaseComment {
  id: string;
  subject: string;
  body?: string | null;
  direction: string;
  authorLabel: string;
  occurredAt: string;
}

export interface PortalDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CreatePortalCaseInput {
  caseType: string;
  subject: string;
  description?: string;
}

export interface CreatePortalCaseCommentInput {
  body: string;
}
