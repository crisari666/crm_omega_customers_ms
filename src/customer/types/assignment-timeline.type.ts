import type { Types } from 'mongoose';
import type { MetaLeadFormFlowStrategy } from '../../meta-lead-forms/types/meta-lead-form-flow-strategy.type';

/** One assignment event on the ventor × time timeline. */
export type AssignmentTimelineEvent = {
  readonly id: string;
  readonly ventorId: string;
  readonly customerId: string;
  readonly customerName?: string;
  readonly customerLastName?: string;
  readonly customerPhone?: string;
  /** Change-log createdAt — when assignedTo was set. */
  readonly assignedAt: string;
  /** Lead ingress time (gateway / campaign / session / customer). */
  readonly arrivedAt: string;
  readonly flowStrategy?: MetaLeadFormFlowStrategy;
  readonly attendedAt?: string;
};

export type AssignmentTimelineResult = {
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly events: readonly AssignmentTimelineEvent[];
  readonly nextCursorBefore?: string;
  readonly hasMoreOlder: boolean;
};

/** Aggregate projection row before mapping to {@link AssignmentTimelineEvent}. */
export type AssignmentTimelineAggRow = {
  readonly _id: Types.ObjectId;
  readonly customerId: Types.ObjectId;
  readonly assignedTo?: string | null;
  readonly createdAt: Date;
  readonly attendedAt?: Date | null;
  readonly customerName?: string;
  readonly customerLastName?: string;
  readonly customerPhone?: string;
  readonly customerCreatedAt?: Date;
  readonly campaignFlowStrategy?: string;
  readonly campaignCreatedAt?: Date;
  readonly campaignGatewayReceivedAt?: string;
  readonly sessionCreatedAt?: Date;
};
