import type { CustomerMetadataFieldDefinition } from './customer-metadata-field.type';

export type CustomerMetadataResponse = {
  readonly customerId: string;
  readonly fields: readonly CustomerMetadataFieldDefinition[];
  readonly values: Record<string, string>;
  readonly completedRequiredCount: number;
  readonly requiredCount: number;
  readonly isComplete: boolean;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
};
