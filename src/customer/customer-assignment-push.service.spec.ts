import { ConfigService } from '@nestjs/config';
import { CustomerAssignmentPushService } from './customer-assignment-push.service';

describe('CustomerAssignmentPushService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function buildService(): CustomerAssignmentPushService {
    const config = {
      get: (key: string, defaultValue?: string) => {
        if (key === 'officeBackInternal.baseUrl') {
          return 'http://office.test/rest/';
        }
        if (key === 'officeBackInternal.apiKey') {
          return 'secret-key';
        }
        if (key === 'firebase.adminCredentialsPath') {
          return '';
        }
        return defaultValue ?? '';
      },
    } as unknown as ConfigService;
    return new CustomerAssignmentPushService(config);
  }

  it('skips send when Firebase credentials are unset', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { '111111111111111111111111': ['token-a'] },
      }),
    }) as unknown as typeof fetch;
    const service = buildService();
    await expect(
      service.executeNotifyAssignmentChange({
        customerId: '222222222222222222222222',
        assignedFrom: undefined,
        assignedTo: '111111111111111111111111',
      }),
    ).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('no-ops when assignee did not change', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const service = buildService();
    await service.executeNotifyAssignmentChange({
      customerId: '222222222222222222222222',
      assignedFrom: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      assignedTo: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
