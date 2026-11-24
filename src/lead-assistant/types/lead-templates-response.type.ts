import type { LeadWhatsappTemplate } from './lead-whatsapp-template.type';

/** Approved templates of the leads line as exposed by the admin API. */
export type LeadTemplatesResponse = {
  readonly templates: readonly LeadWhatsappTemplate[];
  readonly phoneNumberId?: string;
  readonly fetchedAt: string;
  readonly error?: string;
};
