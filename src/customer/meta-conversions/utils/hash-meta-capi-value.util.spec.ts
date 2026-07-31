import {
  buildMetaFbcFromFbclid,
  hashMetaCapiValue,
} from './hash-meta-capi-value.util';

describe('hashMetaCapiValue', () => {
  it('hashes normalized email', () => {
    const actual = hashMetaCapiValue('  Test@Example.COM ', 'email');
    const expected = hashMetaCapiValue('test@example.com', 'email');
    expect(actual).toBe(expected);
    expect(actual).toHaveLength(64);
  });

  it('hashes phone digits only', () => {
    const actual = hashMetaCapiValue('+57 300 123 4567', 'phone');
    const expected = hashMetaCapiValue('573001234567', 'phone');
    expect(actual).toBe(expected);
  });

  it('returns empty for blank input', () => {
    expect(hashMetaCapiValue('   ', 'email')).toBe('');
  });
});

describe('buildMetaFbcFromFbclid', () => {
  it('formats fbclid as fbc', () => {
    expect(buildMetaFbcFromFbclid('AbCd', 1554763741205)).toBe(
      'fb.1.1554763741205.AbCd',
    );
  });

  it('passes through existing fbc', () => {
    const input = 'fb.1.1.xyz';
    expect(buildMetaFbcFromFbclid(input)).toBe(input);
  });

  it('returns empty when missing', () => {
    expect(buildMetaFbcFromFbclid('')).toBe('');
  });
});
