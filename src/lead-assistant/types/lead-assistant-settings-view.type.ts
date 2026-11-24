import type { LeadFlowVersion } from '../../lead-conversation/types/lead-flow-version.type';
import type { LeadTemplateRef } from '../../lead-conversation/types/lead-template-ref.type';
import type { LeadPricePolicy } from './lead-price-policy.type';

/** Assistant identity and behavior settings as exposed by the API. */
export type LeadAssistantSettingsView = {
  readonly assistantName: string;
  readonly businessName: string;
  readonly greeting: string;
  readonly pricePolicy: LeadPricePolicy;
  readonly defaultInboundFlow: LeadFlowVersion;
  readonly enabled: boolean;
  readonly replyDebounceSeconds: number;
  readonly welcomeTemplate?: LeadTemplateRef;
  readonly updatedAt?: string;
};
