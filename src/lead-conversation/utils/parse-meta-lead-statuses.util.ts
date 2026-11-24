import type { InboundLeadStatus } from '../types/inbound-lead-status.type';
import type {
  LeadConversationIngressEnvelope,
  MetaLeadWebhookBody,
  MetaLeadWebhookStatus,
} from '../types/meta-lead-webhook.type';

const MILLISECONDS_PER_SECOND = 1000;

const unwrapBody = (input: unknown): MetaLeadWebhookBody => {
  const envelope = (input ?? {}) as LeadConversationIngressEnvelope;
  return (envelope.payload ?? input ?? {}) as MetaLeadWebhookBody;
};

function mapStatus(status: MetaLeadWebhookStatus): InboundLeadStatus {
  const seconds = Number.parseInt(status.timestamp ?? '', 10);
  const firstError = status.errors?.[0];
  return {
    wamid: status.id as string,
    status: status.status as string,
    timestamp: Number.isFinite(seconds) ? new Date(seconds * MILLISECONDS_PER_SECOND) : new Date(),
    ...(typeof firstError?.code === 'number' ? { errorCode: firstError.code } : {}),
    ...(firstError?.title ? { errorTitle: firstError.title } : {}),
  };
}

/** Flattens a gateway envelope (or raw Meta body) into delivery status updates (`value.statuses`). */
export function parseMetaLeadStatuses(input: unknown): InboundLeadStatus[] {
  const body = unwrapBody(input);
  return (body.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === 'messages' && change.value)
    .flatMap((change) => change.value?.statuses ?? [])
    .filter((status) => Boolean(status.id) && Boolean(status.status))
    .map(mapStatus);
}
