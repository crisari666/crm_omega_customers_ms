import type { DocumentType } from '../schemas/customer.schema';

export type CustomerAdminNote = {
  readonly id: string;
  readonly user: string;
  readonly date: string;
  readonly description: string;
};

export type CustomerAdminInterestedProject = {
  readonly projectId: string;
  readonly date: string;
  readonly addedBy?: string;
};

/**
 * JSON returned by `GET admin/customer/:customerId` (notes = populated descriptions).
 */
export type CustomerAdminDetail = {
  readonly id: string;
  readonly name?: string;
  readonly lastName?: string;
  readonly phone: string;
  readonly whatsapp?: string;
  readonly email?: string;
  readonly documentType?: DocumentType;
  readonly document?: string;
  readonly interestedProjects: CustomerAdminInterestedProject[];
  readonly assignedTo?: string;
  readonly enabled: boolean;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly notes: CustomerAdminNote[];
};
