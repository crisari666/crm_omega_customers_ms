import { parseMetaLeadStatuses } from './parse-meta-lead-statuses.util';

const buildBody = (statuses: unknown[]): unknown => ({
  entry: [{ changes: [{ field: 'messages', value: { statuses } }] }],
});

describe('parseMetaLeadStatuses', () => {
  it('parses delivered and failed statuses with error details', () => {
    const inputBody = buildBody([
      { id: 'wamid.A', status: 'delivered', timestamp: '1700000000' },
      { id: 'wamid.B', status: 'failed', timestamp: '1700000001', errors: [{ code: 131047, title: 'Re-engagement message' }] },
    ]);
    const actual = parseMetaLeadStatuses(inputBody);
    expect(actual).toEqual([
      { wamid: 'wamid.A', status: 'delivered', timestamp: new Date(1700000000000) },
      { wamid: 'wamid.B', status: 'failed', timestamp: new Date(1700000001000), errorCode: 131047, errorTitle: 'Re-engagement message' },
    ]);
  });

  it('unwraps the gateway envelope payload', () => {
    const inputEnvelope = { source: 'gateway', payload: buildBody([{ id: 'wamid.C', status: 'read', timestamp: '1700000002' }]) };
    const actual = parseMetaLeadStatuses(inputEnvelope);
    expect(actual).toHaveLength(1);
    expect(actual[0]?.wamid).toBe('wamid.C');
  });

  it('skips rows without id or status and bodies without statuses', () => {
    const inputBody = buildBody([{ status: 'sent' }, { id: 'wamid.D' }]);
    expect(parseMetaLeadStatuses(inputBody)).toEqual([]);
    expect(parseMetaLeadStatuses({ entry: [{ changes: [{ field: 'messages', value: { messages: [] } }] }] })).toEqual([]);
    expect(parseMetaLeadStatuses(undefined)).toEqual([]);
  });
});
