import type { Types } from 'mongoose';
import type { LeadConversationSession } from '../schemas/lead-conversation-session.schema';
import type { InboundLeadMessage } from './inbound-lead-message.type';
import type { OutboundOption } from './outbound-message-plan.type';

/** Input of a step handler: current session snapshot, inbound message and the option it resolved to. */
export type StepContext = {
  readonly session: Readonly<LeadConversationSession & { readonly _id: Types.ObjectId }>;
  readonly message: InboundLeadMessage;
  readonly selectedOption?: OutboundOption;
};
