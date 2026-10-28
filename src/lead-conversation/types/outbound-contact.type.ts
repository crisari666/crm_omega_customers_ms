/** One phone on a Meta WhatsApp contacts (vCard) outbound plan. */
export type OutboundContactPhone = {
  readonly phone: string;
  readonly type: 'CELL' | 'WORK' | 'MAIN';
  readonly waId?: string;
};

/** Contact card fields for outbound kind `contacts`. */
export type OutboundContact = {
  readonly firstName: string;
  readonly lastName: string;
  readonly phones: readonly OutboundContactPhone[];
};
