import { LeadReadinessService } from './lead-readiness.service';

const execOf = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('LeadReadinessService.executeGetReadiness', () => {
  it('gathers facts and evaluates the rules', async () => {
    const mockFaqModel = {
      distinct: jest.fn().mockReturnValue(execOf(['price', 'financing', 'legal'])),
      countDocuments: jest.fn().mockReturnValue(execOf(4)),
    };
    const mockFormModel = { countDocuments: jest.fn().mockReturnValue(execOf(1)) };
    const mockSettingsService = {
      executeGetOrCreate: jest.fn().mockResolvedValue({
        assistantName: 'Verónica',
        businessName: 'La Ceiba',
        greeting: 'Hola',
        pricePolicy: 'entry_ticket_first',
        defaultInboundFlow: 'v2',
        enabled: true,
        replyDebounceSeconds: 4,
        welcomeTemplate: { name: 'welcome', language: 'es', bodyText: 'Hola', bindings: [] },
      }),
    };
    const mockSequenceService = {
      executeGet: jest.fn().mockResolvedValue({
        steps: [
          {
            id: 's1',
            label: 'x',
            offsetHours: 2,
            enabled: true,
            template: { name: 'followup', language: 'es', bodyText: 'Hola', bindings: [] },
            sentCount: 0,
            repliedCount: 0,
          },
        ],
      }),
    };
    const mockTemplatesService = {
      executeList: jest.fn().mockResolvedValue({
        templates: [
          { name: 'welcome', language: 'es' },
          { name: 'followup', language: 'es' },
        ],
        phoneNumberId: '123',
        fetchedAt: new Date().toISOString(),
      }),
    };
    const mockConfigService = { get: jest.fn().mockReturnValue('123') };
    const service = new LeadReadinessService(
      mockFaqModel as never,
      mockFormModel as never,
      mockSettingsService as never,
      mockSequenceService as never,
      mockTemplatesService as never,
      mockConfigService as never,
    );
    const actual = await service.executeGetReadiness();
    expect(actual).toMatchObject({ readyCount: 5, total: 5 });
    expect(mockFormModel.countDocuments).toHaveBeenCalledWith({ enabled: true, flowStrategy: 'lead_conversation_v2' });
  });

  it('reports connection as missing when the templates RPC fails', async () => {
    const mockFaqModel = {
      distinct: jest.fn().mockReturnValue(execOf([])),
      countDocuments: jest.fn().mockReturnValue(execOf(0)),
    };
    const service = new LeadReadinessService(
      mockFaqModel as never,
      { countDocuments: jest.fn().mockReturnValue(execOf(0)) } as never,
      {
        executeGetOrCreate: jest.fn().mockResolvedValue({
          assistantName: 'V',
          businessName: 'B',
          greeting: 'G',
          enabled: true,
        }),
      } as never,
      { executeGet: jest.fn().mockResolvedValue({ steps: [] }) } as never,
      {
        executeList: jest.fn().mockResolvedValue({ templates: [], fetchedAt: 'x', error: 'timeout' }),
      } as never,
      { get: jest.fn().mockReturnValue('123') } as never,
    );
    const actual = await service.executeGetReadiness();
    expect(actual.items.find((item) => item.key === 'connection')?.status).toBe('missing');
    expect(actual.items.find((item) => item.key === 'knowledge')?.status).toBe('missing');
    expect(actual.readyCount).toBe(0);
  });
});
