export type CustomerAssignmentChangeItem = {
  readonly changeLogId: string;
  readonly customerId: string;
  readonly customerName?: string;
  readonly customerLastName?: string;
  readonly customerPhone?: string;
  readonly occurredAt: string;
  readonly actorUserId?: string;
  readonly assignedFrom?: string;
  readonly assignedTo?: string;
  readonly action: 'create' | 'update';
  readonly attendedAt?: string;
  readonly timeToAttendMs?: number;
};

export type ListCustomerAssignmentChangesResult = {
  readonly items: CustomerAssignmentChangeItem[];
  readonly total: number;
  readonly limit: number;
  readonly skip: number;
  readonly attendedCount: number;
  readonly avgTimeToAttendMs: number | null;
};

export type CustomerAssignmentChangeAggRow = {
  readonly _id: { toString(): string };
  readonly customerId: { toString(): string };
  readonly action: 'create' | 'update';
  readonly actorUserId?: string;
  readonly createdAt: Date;
  readonly assignedFrom?: string;
  readonly assignedTo?: string;
  readonly attendedAt?: Date | null;
  readonly customerName?: string;
  readonly customerLastName?: string;
  readonly customerPhone?: string;
};
