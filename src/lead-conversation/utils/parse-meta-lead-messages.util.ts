import { Logger } from '@nestjs/common';
import { normalizeCustomerPhone } from '../../customer/utils/normalize-customer-phone.util';
import type { InboundLeadMessage } from '../types/inbound-lead-message.type';
import type {
  LeadConversationIngressEnvelope,
  MetaLeadWebhookBody,
  MetaLeadWebhookContact,
  MetaLeadWebhookMessage,
  MetaLeadWebhookValue,
} from '../types/meta-lead-webhook.type';
import {
  extractFormFieldsFromLeadText,
  isInstantFormDump,
} from './extract-form-fields-from-lead-text.util';
import { extractPhoneFromLeadText } from './extract-phone-from-lead-text.util';
import { buildSyntheticLeadWaId, isSendableLeadPhone } from './lead-identity-key.util';

const MILLISECONDS_PER_SECOND = 1000;
const logger = new Logger('ParseMetaLeadMessages');

function extractTextAndReply(message: MetaLeadWebhookMessage): { text: string; replyId?: string } {
  const buttonReply = message.interactive?.button_reply;
  if (buttonReply?.id) return { text: buttonReply.title ?? '', replyId: buttonReply.id };
  const listReply = message.interactive?.list_reply;
  if (listReply?.id) return { text: listReply.title ?? '', replyId: listReply.id };
  if (message.button) return { text: message.button.text ?? message.button.payload ?? '' };
  const text = message.text?.body ?? message.image?.caption ?? message.document?.caption ?? '';
  return { text };
}

function resolveContact(value: MetaLeadWebhookValue, waId: string): MetaLeadWebhookContact | undefined {
  const contacts = value.contacts ?? [];
  const byWaId = contacts.find((row) => normalizeCustomerPhone(row.wa_id ?? '') === waId);
  return byWaId ?? contacts[0];
}

function resolveContactWaId(value: MetaLeadWebhookValue): string | undefined {
  for (const contact of value.contacts ?? []) {
    const raw = contact.wa_id?.trim() ?? '';
    if (!raw) continue;
    const waId = normalizeCustomerPhone(raw);
    if (isSendableLeadPhone(waId)) return waId;
  }
  return undefined;
}

type ResolvedWaId = {
  readonly waId: string;
  readonly fromBody: boolean;
  readonly hasSendablePhone: boolean;
};

function resolveWaId(
  message: MetaLeadWebhookMessage,
  text: string,
  value: MetaLeadWebhookValue,
  contactPreview: MetaLeadWebhookContact | undefined,
): ResolvedWaId | undefined {
  const from = message.from?.trim();
  if (from) {
    const waId = normalizeCustomerPhone(from);
    if (isSendableLeadPhone(waId)) return { waId, fromBody: false, hasSendablePhone: true };
  }
  const fromBody = extractPhoneFromLeadText(text);
  if (fromBody) return { waId: fromBody, fromBody: true, hasSendablePhone: true };
  const fromContact = resolveContactWaId(value);
  if (fromContact) return { waId: fromContact, fromBody: false, hasSendablePhone: true };
  const metaWhatsappUserId = message.from_user_id?.trim() || contactPreview?.user_id?.trim();
  const whatsappUsername = contactPreview?.profile?.username?.trim();
  const synthetic = buildSyntheticLeadWaId({
    ...(metaWhatsappUserId ? { metaWhatsappUserId } : {}),
    ...(whatsappUsername ? { whatsappUsername } : {}),
  });
  if (synthetic) {
    return { waId: synthetic, fromBody: false, hasSendablePhone: false };
  }
  return undefined;
}

function resolveMetaWhatsappUserId(
  message: MetaLeadWebhookMessage,
  contact: MetaLeadWebhookContact | undefined,
): string | undefined {
  const fromMessage = message.from_user_id?.trim();
  if (fromMessage) return fromMessage;
  const fromContact = contact?.user_id?.trim();
  return fromContact && fromContact.length > 0 ? fromContact : undefined;
}

function mapMessage(value: MetaLeadWebhookValue, message: MetaLeadWebhookMessage): InboundLeadMessage | null {
  const { text, replyId } = extractTextAndReply(message);
  const contactPreview = (value.contacts ?? [])[0];
  const resolved = resolveWaId(message, text, value, contactPreview);
  if (!resolved) {
    logger.warn(
      `Skipping lead message ${message.id}: no phone, Meta user id, or username ` +
        `(from_user_id=${message.from_user_id ?? contactPreview?.user_id ?? 'n/a'} ` +
        `username=${contactPreview?.profile?.username ?? 'n/a'})`,
    );
    return null;
  }
  if (resolved.fromBody) {
    logger.warn(`Lead message ${message.id}: resolved waId=${resolved.waId} from text body (missing message.from)`);
  }
  if (!resolved.hasSendablePhone) {
    logger.warn(
      `Lead message ${message.id}: username-only identity waId=${resolved.waId} ` +
        `(outbound suppressed until a sendable phone is known)`,
    );
  }
  const contact = resolveContact(value, resolved.waId);
  const formFields = extractFormFieldsFromLeadText(text);
  const formDump = isInstantFormDump(text);
  const profileName =
    formFields.fullName ??
    contact?.profile?.name?.trim() ??
    '';
  const whatsappUsername = contact?.profile?.username?.trim();
  const metaWhatsappUserId = resolveMetaWhatsappUserId(message, contact);
  const ctwaClid = message.referral?.ctwa_clid?.trim();
  const seconds = Number.parseInt(message.timestamp, 10);
  return {
    wamid: message.id,
    waId: resolved.waId,
    hasSendablePhone: resolved.hasSendablePhone,
    phoneNumberId: value.metadata?.phone_number_id?.trim() ?? '',
    profileName,
    type: message.type,
    text,
    ...(replyId ? { replyId } : {}),
    timestamp: Number.isFinite(seconds) ? new Date(seconds * MILLISECONDS_PER_SECOND) : new Date(),
    ...(formFields.email ? { email: formFields.email } : {}),
    ...(whatsappUsername ? { whatsappUsername } : {}),
    ...(metaWhatsappUserId ? { metaWhatsappUserId } : {}),
    ...(ctwaClid ? { ctwaClid } : {}),
    ...(formDump ? { isInstantFormDump: true } : {}),
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
      return (value.messages ?? [])
        .filter((message) => Boolean(message.id))
        .map((message) => mapMessage(value, message))
        .filter((row): row is InboundLeadMessage => row !== null);
    });
}
