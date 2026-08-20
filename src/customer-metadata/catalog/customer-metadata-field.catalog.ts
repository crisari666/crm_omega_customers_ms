import type { CustomerMetadataFieldDefinition } from '../types/customer-metadata-field.type';

const ECONOMIC_CAPACITY_STEP_M = 10;
const ECONOMIC_CAPACITY_MAX_M = 240;

/**
 * Money ranges in COP millions: 0-10, 10-20, … 230-240.
 */
export function buildEconomicCapacityOptionCodes(): readonly string[] {
  const codes: string[] = [];
  for (
    let from = 0;
    from < ECONOMIC_CAPACITY_MAX_M;
    from += ECONOMIC_CAPACITY_STEP_M
  ) {
    const to = from + ECONOMIC_CAPACITY_STEP_M;
    codes.push(`${from}_${to}m`);
  }
  return codes;
}

/**
 * Code-defined Stage 3 qualification field catalog.
 * Option codes are stable; UI labels live in each client app i18n
 * (except economic capacity ranges, which are formatted from codes).
 */
export const CUSTOMER_METADATA_FIELD_CATALOG: readonly CustomerMetadataFieldDefinition[] =
  [
    {
      key: 'economicCapacity',
      type: 'select',
      required: true,
      optionCodes: buildEconomicCapacityOptionCodes(),
    },
    {
      key: 'city',
      type: 'text',
      required: true,
    },
    {
      key: 'timeToBuy',
      type: 'select',
      required: true,
      optionCodes: [
        'immediate',
        '1_3_months',
        '3_6_months',
        '6_12_months',
        'over_1_year',
      ],
    },
    {
      key: 'paymentMethod',
      type: 'select',
      required: true,
      optionCodes: ['cash', 'financing', 'cash_and_financing', 'subsidy'],
    },
    {
      key: 'buyMotive',
      type: 'select',
      required: true,
      optionCodes: ['live', 'invest', 'both'],
    },
    {
      key: 'projectId',
      type: 'project',
      required: true,
    },
    {
      key: 'urgencyLevel',
      type: 'select',
      required: true,
      optionCodes: ['low', 'medium', 'high'],
    },
    {
      key: 'decisionMaker',
      type: 'select',
      required: true,
      optionCodes: ['self', 'spouse', 'family', 'other'],
    },
  ] as const;

export const CUSTOMER_METADATA_FIELD_KEYS: readonly string[] =
  CUSTOMER_METADATA_FIELD_CATALOG.map((field) => field.key);

export function findCustomerMetadataField(
  key: string,
): CustomerMetadataFieldDefinition | undefined {
  return CUSTOMER_METADATA_FIELD_CATALOG.find((field) => field.key === key);
}
