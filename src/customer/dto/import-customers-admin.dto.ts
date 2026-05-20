import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ImportCustomerAdminItemDto } from './import-customer-admin-item.dto';

const IMPORT_CUSTOMERS_MAX_ROWS = 1000;

/**
 * Body for POST /admin/customer/import.
 */
export class ImportCustomersAdminDto {
  @IsArray()
  @ArrayMaxSize(IMPORT_CUSTOMERS_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerAdminItemDto)
  customers: ImportCustomerAdminItemDto[];
}
