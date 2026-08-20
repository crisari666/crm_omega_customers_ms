import { BadRequestException } from '@nestjs/common';
import {
  CUSTOMER_METADATA_FIELD_CATALOG,
  findCustomerMetadataField,
} from '../catalog/customer-metadata-field.catalog';

export type ValidatedCustomerMetadataValues = Record<string, string>;

/**
 * Validates metadata values against the field catalog.
 * Rejects unknown keys and invalid select option codes.
 */
export function validateCustomerMetadataValues(
  input: Record<string, unknown>,
): ValidatedCustomerMetadataValues {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('values must be an object');
  }
  const result: ValidatedCustomerMetadataValues = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    const field = findCustomerMetadataField(key);
    if (field === undefined) {
      throw new BadRequestException(`Unknown metadata field: ${key}`);
    }
    if (typeof rawValue !== 'string') {
      throw new BadRequestException(`Field ${key} must be a string`);
    }
    const value = rawValue.trim();
    if (value === '') {
      continue;
    }
    if (
      field.type === 'select' &&
      field.optionCodes !== undefined &&
      !field.optionCodes.includes(value)
    ) {
      throw new BadRequestException(
        `Invalid option for ${key}: ${value}`,
      );
    }
    result[key] = value;
  }
  return result;
}

export type CustomerMetadataCompleteness = {
  readonly completedRequiredCount: number;
  readonly requiredCount: number;
  readonly isComplete: boolean;
};

/**
 * Computes required-field completeness from stored values.
 */
export function computeCustomerMetadataCompleteness(
  values: Record<string, string>,
): CustomerMetadataCompleteness {
  const requiredFields = CUSTOMER_METADATA_FIELD_CATALOG.filter(
    (field) => field.required,
  );
  const requiredCount = requiredFields.length;
  let completedRequiredCount = 0;
  for (const field of requiredFields) {
    const value = values[field.key];
    if (typeof value === 'string' && value.trim() !== '') {
      completedRequiredCount += 1;
    }
  }
  return {
    completedRequiredCount,
    requiredCount,
    isComplete: completedRequiredCount === requiredCount,
  };
}
