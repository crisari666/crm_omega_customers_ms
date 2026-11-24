import { of, throwError } from 'rxjs';
import { LEAD_CONVERSATION_TEMPLATES_LIST_PATTERN } from '../lead-conversation/constants/lead-conversation.constants';
import { LeadTemplatesService } from './lead-templates.service';

const okResult = { success: true, phoneNumberId: '123', templates: [{ name: 'welcome', language: 'es' }] };

describe('LeadTemplatesService.executeList', () => {
  it('caches a successful response and refreshes on demand', async () => {
    const mockClient = { send: jest.fn().mockReturnValue(of(okResult)) };
    const service = new LeadTemplatesService(mockClient as never);
    const first = await service.executeList();
    await service.executeList();
    expect(mockClient.send).toHaveBeenCalledTimes(1);
    expect(mockClient.send).toHaveBeenCalledWith(LEAD_CONVERSATION_TEMPLATES_LIST_PATTERN, {});
    expect(first).toMatchObject({ phoneNumberId: '123', templates: okResult.templates });
    expect(first.error).toBeUndefined();
    await service.executeList(true);
    expect(mockClient.send).toHaveBeenCalledTimes(2);
  });

  it('reports RPC failures in `error` without caching them', async () => {
    const mockClient = {
      send: jest.fn().mockReturnValueOnce(throwError(() => new Error('boom'))).mockReturnValue(of(okResult)),
    };
    const service = new LeadTemplatesService(mockClient as never);
    const failed = await service.executeList();
    expect(failed).toMatchObject({ templates: [], error: 'boom' });
    const recovered = await service.executeList();
    expect(recovered.error).toBeUndefined();
    expect(mockClient.send).toHaveBeenCalledTimes(2);
  });

  it('maps success:false replies to an error', async () => {
    const mockClient = {
      send: jest.fn().mockReturnValue(of({ success: false, error: 'WABA missing', templates: [] })),
    };
    const service = new LeadTemplatesService(mockClient as never);
    await expect(service.executeList()).resolves.toMatchObject({ error: 'WABA missing', templates: [] });
  });
});
