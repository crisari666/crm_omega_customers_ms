import { BadRequestException } from '@nestjs/common';
import {
  computeCustomerMetadataCompleteness,
  validateCustomerMetadataValues,
} from './validate-customer-metadata-values.util';

describe('validateCustomerMetadataValues', () => {
  it('accepts valid select and text values', () => {
    const actual = validateCustomerMetadataValues({
      economicCapacity: '20_30m',
      city: 'Medellín',
      projectId: 'abc123',
    });
    expect(actual).toEqual({
      economicCapacity: '20_30m',
      city: 'Medellín',
      projectId: 'abc123',
    });
  });

  it('rejects unknown field keys', () => {
    expect(() =>
      validateCustomerMetadataValues({ unknownField: 'x' }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid select option codes', () => {
    expect(() =>
      validateCustomerMetadataValues({ economicCapacity: 'not_a_range' }),
    ).toThrow(BadRequestException);
  });

  it('skips empty trimmed strings', () => {
    const actual = validateCustomerMetadataValues({
      city: '  ',
      urgencyLevel: 'high',
    });
    expect(actual).toEqual({ urgencyLevel: 'high' });
  });
});

describe('computeCustomerMetadataCompleteness', () => {
  it('reports incomplete when required fields are missing', () => {
    const actual = computeCustomerMetadataCompleteness({
      city: 'Bogotá',
    });
    expect(actual.requiredCount).toBe(8);
    expect(actual.completedRequiredCount).toBe(1);
    expect(actual.isComplete).toBe(false);
  });

  it('reports complete when all required fields are set', () => {
    const actual = computeCustomerMetadataCompleteness({
      economicCapacity: '0_10m',
      city: 'Cali',
      timeToBuy: 'immediate',
      paymentMethod: 'cash',
      buyMotive: 'live',
      projectId: 'proj1',
      urgencyLevel: 'high',
      decisionMaker: 'self',
    });
    expect(actual.completedRequiredCount).toBe(8);
    expect(actual.isComplete).toBe(true);
  });
});
