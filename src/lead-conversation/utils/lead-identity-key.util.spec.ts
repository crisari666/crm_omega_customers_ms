import {
  buildSyntheticLeadWaId,
  isSendableLeadPhone,
  isSyntheticLeadWaId,
  normalizeWhatsappUsername,
} from './lead-identity-key.util';
import { formatLeadContactDisplay } from './format-lead-contact-display.util';

describe('lead-identity-key.util', () => {
  it('detects sendable digit phones', () => {
    expect(isSendableLeadPhone('573001112233')).toBe(true);
    expect(isSendableLeadPhone('meta:CO.1')).toBe(false);
    expect(isSendableLeadPhone('123')).toBe(false);
  });

  it('builds synthetic keys preferring Meta user id', () => {
    expect(
      buildSyntheticLeadWaId({
        metaWhatsappUserId: 'CO.4513634245617612',
        whatsappUsername: 'carmendozar',
      }),
    ).toBe('meta:CO.4513634245617612');
    expect(buildSyntheticLeadWaId({ whatsappUsername: '@CarmenDozar' })).toBe('username:carmendozar');
    expect(isSyntheticLeadWaId('meta:CO.1')).toBe(true);
    expect(normalizeWhatsappUsername('@PipePalo')).toBe('pipepalo');
  });

  it('formats contact display with @username for synthetic phones', () => {
    expect(
      formatLeadContactDisplay({
        phone: 'meta:CO.1',
        whatsappUsername: 'carmendozar',
      }),
    ).toBe('@carmendozar');
    expect(formatLeadContactDisplay({ phone: '573001112233', whatsappUsername: 'ana' })).toBe(
      '573001112233',
    );
  });
});
