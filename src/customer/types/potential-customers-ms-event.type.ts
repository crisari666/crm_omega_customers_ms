export type PotentialCustomersContactPayload = {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly waId?: string;
  /** Twilio VOIP caller ID shown as MAIN on the Meta contacts card. */
  readonly voipPhone?: string;
};

export type PotentialCustomersMsEvent = {
  readonly type: 'potential_customers';
  readonly payload: {
    readonly action:
      | 'send.potential_customer_template'
      | 'send.potential_customer_text'
      | 'send.potential_customer_contacts';
    readonly waId: string;
    readonly phoneNumberId?: string;
    readonly contactName?: string;
    readonly customerId?: string;
    readonly body?: string;
    readonly contact?: PotentialCustomersContactPayload;
  };
};
