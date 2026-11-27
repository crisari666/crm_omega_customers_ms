/** One aggregation bucket: step name, temperature, or `unset`. */
export type LeadConversationStatsBucket = {
  readonly key: string;
  readonly count: number;
};
