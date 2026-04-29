import type { CreateCustomerEventDto } from '../dto/create-customer-event.dto';
import type { CustomerEventType } from '../schemas/customer-event.schema';

export type CustomerEventItem = {
  readonly id: string;
  readonly eventType: CustomerEventType;
  readonly description: string;
  readonly score?: number;
  readonly customerId: string;
  readonly userId: string;
  readonly officeId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ListCustomerEventsResult = {
  readonly items: CustomerEventItem[];
  readonly total: number;
  readonly limit: number;
  readonly skip: number;
};

export type CreateEventArgs = {
  readonly customerId: string;
  readonly actorUserId: string;
  readonly officeId?: string;
  readonly body: CreateCustomerEventDto;
};

export type CreateCallCrmEventArgs = {
  readonly customerRef: string;
  readonly callSid: string;
  readonly userId?: string;
  readonly description?: string;
};
