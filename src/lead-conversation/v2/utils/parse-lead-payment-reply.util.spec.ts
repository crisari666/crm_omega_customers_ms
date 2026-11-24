import { parseLeadPaymentFromPending, parseLeadPaymentReply } from './parse-lead-payment-reply.util';

describe('parseLeadPaymentReply', () => {
  it('detects financed and cash stems', () => {
    expect(parseLeadPaymentReply('Financiado')).toBe('financed');
    expect(parseLeadPaymentReply('💰 Financiado')).toBe('financed');
    expect(parseLeadPaymentReply('De contado')).toBe('cash');
    expect(parseLeadPaymentReply('hola')).toBeUndefined();
  });
});

describe('parseLeadPaymentFromPending', () => {
  it('prefers the newest pending text', () => {
    expect(parseLeadPaymentFromPending(['Hola', 'Financiado'])).toBe('financed');
    expect(parseLeadPaymentFromPending(['Hola', 'ok'])).toBeUndefined();
  });
});
