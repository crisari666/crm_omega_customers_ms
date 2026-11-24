import type { LeadConversationAnswers } from '../../types/lead-conversation-answers.type';
import type { LeadProfile } from '../../types/lead-profile.type';

/** Facts the advisor brief is written from. */
export type LeadAgentBriefInput = {
  readonly profile: LeadProfile;
  readonly projectTitle?: string;
  readonly answers?: LeadConversationAnswers;
};
