import type { LeadResolvedFaq } from '../../../lead-assistant/types/lead-resolved-faq.type';
import type { LeadPricePolicy } from '../../../lead-assistant/types/lead-price-policy.type';
import type { LeadAgentHistoryMessage } from './lead-agent-history-message.type';
import type { LeadAgentPendingMessage } from './lead-agent-pending-message.type';
import type { LeadAgentSessionView } from './lead-agent-session-view.type';
import type { ProjectCatalogSummaryItem } from './project-catalog-summary-item.type';
import type { ProjectKnowledge } from './project-knowledge.type';
import type { SuggestedLeadProject } from './resolved-lead-project.type';

/** Everything the prompt builder needs to write the messages of one agent turn. */
export type LeadAgentPromptInput = {
  readonly assistantName: string;
  readonly businessName: string;
  /** Greeting template with `{{customerName}}`, `{{assistantName}}` and `{{businessName}}` placeholders. */
  readonly greeting: string;
  readonly pricePolicy: LeadPricePolicy;
  readonly session: LeadAgentSessionView;
  readonly history: readonly LeadAgentHistoryMessage[];
  readonly pendingMessages: readonly LeadAgentPendingMessage[];
  /** Confirmed project knowledge; when absent the prompt carries `catalog` instead. */
  readonly project?: ProjectKnowledge;
  /** Soft Meta-ad hint — does not clear `needsProject` until Instant Form adopt or confirm. */
  readonly suggestedProject?: SuggestedLeadProject;
  readonly catalog: readonly ProjectCatalogSummaryItem[];
  readonly faqs: readonly LeadResolvedFaq[];
  /** Stage-3 capture already known (form + prior answers). */
  readonly captureKnown?: Readonly<Record<string, string>>;
  readonly missingCaptureFields?: readonly string[];
  readonly nextCaptureField?: string;
  /** When true the system sends the monthly-installment offer; the LLM must not invent figures. */
  readonly systemSendsFinancing?: boolean;
  /** When true the system already sends the configured greeting as the first outbound. */
  readonly systemSendsGreeting?: boolean;
};
