export type MetaLeadgenFieldRow = {
  readonly name: string;
  readonly values?: readonly string[];
};

export type MetaLeadgenFormMeta = {
  readonly name?: string;
  readonly status?: string;
  readonly locale?: string;
};

export type MetaLeadgenGraphPayload = {
  readonly fieldData: readonly MetaLeadgenFieldRow[];
  readonly adId?: string;
  readonly formId?: string;
  readonly createdTime?: string;
  readonly platform?: string;
  readonly form?: MetaLeadgenFormMeta;
};

export type MetaLeadgenWebhookValue = {
  readonly leadgen_id?: string;
  readonly page_id?: string;
  readonly form_id?: string;
  readonly ad_id?: string;
  readonly adgroup_id?: string;
  readonly created_time?: number;
};

export type MetaLeadgenContact = {
  readonly name: string;
  readonly lastName: string;
  readonly email: string;
  readonly phoneDigits: string;
};

export type MetaLeadgenIngestEnvelope = {
  readonly source: 'ceiba';
  readonly receivedAt: string;
  readonly leadgenId: string;
  readonly webhookValue?: MetaLeadgenWebhookValue;
  readonly mappedFields: Record<string, string>;
  readonly graph: MetaLeadgenGraphPayload;
  readonly contact: MetaLeadgenContact;
};
