import type { LeadWhatsappTemplate } from './lead-whatsapp-template.type';

/** Raw RPC reply of `lead_conversation.templates.list.v1`. */
export type LeadTemplatesListResult = {
  readonly success: boolean;
  readonly error?: string;
  readonly phoneNumberId?: string;
  readonly templates: readonly LeadWhatsappTemplate[];
};
