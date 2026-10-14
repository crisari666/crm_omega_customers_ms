import { normalizeCustomerPhone } from '../../customer/utils/normalize-customer-phone.util';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import type {
  LeadConversationIngressEnvelope,
  MetaLeadWebhookBody,
  MetaLeadWebhookMessage,
  MetaLeadWebhookValue,
} from '../types/meta-lead-webhook.type';

const MILLISECONDS_PER_SECOND = 1000;

function extractTextAndReply(message: MetaLeadWebhookMessage): { text: string; replyId?: string } {
  const buttonReply = message.interactive?.button_reply;
  if (buttonReply?.id) return { text: buttonReply.title ?? '', replyId: buttonReply.id };
  const listReply = message.interactive?.list_reply;
  if (listReply?.id) return { text: listReply.title ?? '', replyId: listReply.id };
  if (message.button) return { text: message.button.text ?? message.button.payload ?? '' };
  const text = message.text?.body ?? message.image?.caption ?? message.document?.caption ?? '';
  return { text };
}

function resolveProfileName(value: MetaLeadWebhookValue, waId: string): string {
  const contact = (value.contacts ?? []).find((row) => normalizeCustomerPhone(row.wa_id ?? '') === waId);
  return (contact ?? value.contacts?.[0])?.profile?.name?.trim() ?? '';
}

function mapMessage(value: MetaLeadWebhookValue, message: MetaLeadWebhookMessage): InboundLeadMessage {
  const waId = normalizeCustomerPhone(message.from);
  const seconds = Number.parseInt(message.timestamp, 10);
  return {
    wamid: message.id,
    waId,
    phoneNumberId: value.metadata?.phone_number_id?.trim() ?? '',
    profileName: resolveProfileName(value, waId),
    type: message.type,
    ...extractTextAndReply(message),
    timestamp: Number.isFinite(seconds) ? new Date(seconds * MILLISECONDS_PER_SECOND) : new Date(),
  };
}

const unwrapBody = (input: unknown): MetaLeadWebhookBody => {
  const envelope = (input ?? {}) as LeadConversationIngressEnvelope;
  return (envelope.payload ?? input ?? {}) as MetaLeadWebhookBody;
};

/** Flattens a gateway envelope (or raw Meta body) into inbound messages; statuses are ignored. */
export function parseMetaLeadMessages(input: unknown): InboundLeadMessage[] {
  const body = unwrapBody(input);
  return (body.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === 'messages' && change.value)
    .flatMap((change) => {
      const value = change.value as MetaLeadWebhookValue;
      return (value.messages ?? []).filter((message) => message.id && message.from).map((message) => mapMessage(value, message));
    });
}
