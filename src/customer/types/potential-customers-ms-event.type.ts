export type PotentialCustomersMsEvent = {
  readonly type: 'potential_customers';
  readonly payload: {
    readonly action: 'send.potential_customer_template' | 'send.potential_customer_text';
    readonly waId: string;
    readonly phoneNumberId?: string;
    readonly contactName?: string;
    readonly customerId?: string;
    readonly body?: string;
  };
};
