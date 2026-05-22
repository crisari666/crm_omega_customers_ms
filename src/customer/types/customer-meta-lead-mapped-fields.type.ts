export type CustomerMetaLeadMappedFieldItem = {
  readonly label: string;
  readonly value: string;
};

export type CustomerMetaLeadMappedFieldsResponse = {
  readonly hasLead: boolean;
  readonly leadgenId?: string;
  readonly items: CustomerMetaLeadMappedFieldItem[];
};
