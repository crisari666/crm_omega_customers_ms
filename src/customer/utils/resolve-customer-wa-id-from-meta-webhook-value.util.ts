import { MetaWebhookMessagesValue } from '../types/meta-webhook-messages-value.type';
import { normalizeCustomerPhone } from './normalize-customer-phone.util';

export type MetaWebhookPhoneItemKind = 'message' | 'status';

type MetaWebhookMessage = NonNullable<MetaWebhookMessagesValue['messages']>[number];
type MetaWebhookStatus = NonNullable<MetaWebhookMessagesValue['statuses']>[number];

/**
 * Resolves customer WhatsApp id: `message.from` / `status.recipient_id`, else first `contacts[].wa_id`.
 */
export function resolveCustomerWaIdFromMetaWebhookValue(
  value: MetaWebhookMessagesValue,
  item?: MetaWebhookMessage | MetaWebhookStatus,
  itemKind: MetaWebhookPhoneItemKind = 'message',
): string {
  if (item != null) {
    if (itemKind === 'message') {
      return normalizeCustomerPhone((item as MetaWebhookMessage).from);
    }
    return normalizeCustomerPhone((item as MetaWebhookStatus).recipient_id);
  }
  const waId: string | undefined = value.contacts?.[0]?.wa_id;
  return waId != null ? normalizeCustomerPhone(waId) : '';
}
