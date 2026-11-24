/** Variable placeholder of an approved WhatsApp template. */
export type LeadWhatsappTemplateVariable = {
  readonly name: string;
  readonly component: 'header' | 'body';
  readonly format: 'named' | 'positional';
};

/** Approved WhatsApp template returned by whatsapp_cloud_ms. */
export type LeadWhatsappTemplate = {
  readonly name: string;
  readonly language: string;
  readonly category: string;
  readonly bodyText: string;
  readonly headerFormat?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  readonly headerText?: string;
  readonly footerText?: string;
  readonly buttons: readonly { readonly type: string; readonly text: string }[];
  readonly variables: readonly LeadWhatsappTemplateVariable[];
  readonly isSupported: boolean;
  readonly unsupportedReason?: 'media_header' | 'dynamic_button';
};
