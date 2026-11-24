export type LeadTemplateBindingSource =
  | 'customer_first_name'
  | 'assistant_name'
  | 'business_name'
  | 'project_title'
  | 'static';

/** Maps one WhatsApp template variable to a value source. */
export type LeadTemplateBinding = {
  readonly variable: string;
  readonly component: 'header' | 'body';
  readonly format: 'named' | 'positional';
  readonly source: LeadTemplateBindingSource;
  readonly staticValue?: string;
};
