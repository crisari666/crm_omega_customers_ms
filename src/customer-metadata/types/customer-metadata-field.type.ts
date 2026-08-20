export type CustomerMetadataFieldType = 'select' | 'text' | 'project';

export type CustomerMetadataFieldDefinition = {
  readonly key: string;
  readonly type: CustomerMetadataFieldType;
  readonly required: boolean;
  readonly optionCodes?: readonly string[];
};
