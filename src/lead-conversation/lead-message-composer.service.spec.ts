import { ConfigService } from '@nestjs/config';
import { PAUSE_BEFORE_VENTOR_CONTACT_MS } from './constants/lead-conversation.constants';
import { LeadMessageComposerService } from './lead-message-composer.service';
import { ProjectCatalogService } from './project-catalog.service';

describe('LeadMessageComposerService.composeConfirmation', () => {
  const mockConfig = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'leadConversation.brand') return 'La Ceiba';
      if (key === 'leadConversation.location') return 'Carmen de Apicalá';
      return fallback;
    }),
  };
  const mockCatalog = {} as ProjectCatalogService;
  const service = new LeadMessageComposerService(
    mockConfig as unknown as ConfigService,
    mockCatalog,
  );
  const scheduledAt = new Date('2026-10-15T14:00:00.000Z');

  it('returns text only when ventor has no phones', () => {
    const actual = service.composeConfirmation('María', scheduledAt, {
      id: 'u1',
      name: 'Ana',
      lastName: 'López',
      phone: '',
      phoneJob: '',
      voipPhone: '',
    });
    expect(actual).toHaveLength(1);
    expect(actual[0].kind).toBe('text');
    expect(actual[0].body).toContain('Ana López');
    expect(actual[0].body).not.toContain('ficha de contacto');
  });

  it('returns text + contacts when ventor has phone and phoneJob', () => {
    const actual = service.composeConfirmation('María', scheduledAt, {
      id: 'u1',
      name: 'Ana',
      lastName: 'López',
      phone: '3001112233',
      phoneJob: '6015551212',
      voipPhone: '',
    });
    expect(actual).toHaveLength(2);
    expect(actual[0].kind).toBe('text');
    expect(actual[0].body).toContain('Tu asesor Ana López');
    expect(actual[0].body).toContain('ficha de contacto');
    expect(actual[1]).toMatchObject({
      kind: 'contacts',
      delayMs: PAUSE_BEFORE_VENTOR_CONTACT_MS,
      contact: {
        firstName: 'Ana',
        lastName: 'López',
        phones: [
          { phone: '3001112233', type: 'CELL', waId: '3001112233' },
          { phone: '6015551212', type: 'WORK', waId: '6015551212' },
        ],
      },
    });
  });

  it('returns text only when no ventor is provided', () => {
    const actual = service.composeConfirmation('María', scheduledAt);
    expect(actual).toHaveLength(1);
    expect(actual[0].body).toContain('Un asesor de La Ceiba');
  });
});
