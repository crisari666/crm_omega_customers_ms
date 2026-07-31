export type MetaCapiUserData = {
  readonly lead_id?: number;
  readonly em?: readonly string[];
  readonly ph?: readonly string[];
  readonly fn?: readonly string[];
  readonly ln?: readonly string[];
  readonly ctwa_clid?: string;
  readonly fbc?: string;
};

export type MetaCapiLeadEventPayload = {
  readonly data: readonly {
    readonly event_name: 'Lead';
    readonly event_time: number;
    readonly action_source: 'system_generated';
    readonly custom_data: {
      readonly event_source: 'crm';
      readonly lead_event_source: string;
    };
    readonly user_data: MetaCapiUserData;
  }[];
};
