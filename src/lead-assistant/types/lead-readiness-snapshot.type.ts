import type { LeadAssistantSettingsView } from './lead-assistant-settings-view.type';
import type { LeadFaqCategory } from './lead-faq-category.type';
import type { LeadRecoveryStep } from './lead-recovery-step.type';

/** Facts gathered by the readiness service; the readiness rules are pure functions of this. */
export type LeadReadinessSnapshot = {
  readonly configuredPhoneNumberId: string;
  /** Set when the templates RPC failed. */
  readonly templatesError?: string;
  readonly rpcPhoneNumberId?: string;
  /** Keys (`name::language`) of the approved templates. */
  readonly approvedTemplateKeys: ReadonlySet<string>;
  readonly settings: LeadAssistantSettingsView;
  readonly enabledFaqCount: number;
  readonly enabledFaqCategories: ReadonlySet<LeadFaqCategory>;
  readonly steps: readonly LeadRecoveryStep[];
  readonly hasEnabledV2Form: boolean;
};
