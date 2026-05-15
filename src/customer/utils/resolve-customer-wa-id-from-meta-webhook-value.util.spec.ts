import { MetaWebhookMessagesValue } from '../types/meta-webhook-messages-value.type';
import { resolveCustomerWaIdFromMetaWebhookValue } from './resolve-customer-wa-id-from-meta-webhook-value.util';

describe('resolveCustomerWaIdFromMetaWebhookValue', () => {
  const value: MetaWebhookMessagesValue = {
    metadata: { phone_number_id: '1054378001085936' },
    contacts: [{ wa_id: '573108834323' }],
    messages: [{ from: '+57 310 8834323', id: 'wamid.x', timestamp: '1', type: 'text' }],
    statuses: [{ id: 'wamid.y', status: 'delivered', timestamp: '1', recipient_id: '573108834323' }],
  };

  it('returns normalized message.from', () => {
    const actual: string = resolveCustomerWaIdFromMetaWebhookValue(value, value.messages![0], 'message');
    expect(actual).toBe('573108834323');
  });

  it('returns normalized status.recipient_id', () => {
    const actual: string = resolveCustomerWaIdFromMetaWebhookValue(value, value.statuses![0], 'status');
    expect(actual).toBe('573108834323');
  });
});
