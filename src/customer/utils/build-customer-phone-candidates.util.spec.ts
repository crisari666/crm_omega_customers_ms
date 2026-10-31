import { buildCustomerPhoneCandidates } from './build-customer-phone-candidates.util';

describe('buildCustomerPhoneCandidates', () => {
  it('expands a national CO mobile to include country code', () => {
    const actual = buildCustomerPhoneCandidates('3001234567');
    expect(actual).toEqual(expect.arrayContaining(['3001234567', '573001234567']));
  });

  it('expands an international CO mobile to include national form', () => {
    const actual = buildCustomerPhoneCandidates('+57 300 123 4567');
    expect(actual).toEqual(
      expect.arrayContaining(['+57 300 123 4567', '573001234567', '3001234567']),
    );
  });

  it('dedupes wa_id style digits', () => {
    const actual = buildCustomerPhoneCandidates('573001234567');
    expect(actual.filter((value) => value === '573001234567')).toHaveLength(1);
    expect(actual).toContain('3001234567');
  });
});
