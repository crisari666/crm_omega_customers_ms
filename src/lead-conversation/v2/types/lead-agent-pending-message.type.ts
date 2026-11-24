/** Customer message not answered yet. */
export type LeadAgentPendingMessage = {
  readonly text: string;
  readonly isInstantFormDump?: boolean;
  /** Meta interactive button/list reply id when the customer tapped an option. */
  readonly replyId?: string;
};
