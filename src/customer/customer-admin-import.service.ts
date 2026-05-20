import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ImportCustomerAdminItemDto } from './dto/import-customer-admin-item.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import type {
  ImportCustomerAdminResultItem,
  ImportCustomersAdminResponse,
} from './types/import-customers-admin-result.type';
import { findCustomerByPhoneCandidates } from './utils/find-customer-by-phone-candidates.util';
import { normalizeCustomerPhone } from './utils/normalize-customer-phone.util';

/**
 * Admin bulk import from CSV: per-row results, no batch failure on duplicates.
 */
@Injectable()
export class CustomerAdminImportService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async executeImportCustomersAdmin(
    customers: ImportCustomerAdminItemDto[],
    createdBy: string,
  ): Promise<ImportCustomersAdminResponse> {
    const results: ImportCustomerAdminResultItem[] = [];
    for (const row of customers) {
      const rowResult = await this.processImportRow(row, createdBy);
      results.push(rowResult);
    }
    return { results };
  }

  private async processImportRow(
    row: ImportCustomerAdminItemDto,
    createdBy: string,
  ): Promise<ImportCustomerAdminResultItem> {
    const rawPhone = row.phone?.trim() ?? '';
    if (rawPhone === '') {
      return { phone: row.phone ?? '', status: 'error', message: 'Phone is required' };
    }
    const canonicalPhone = normalizeCustomerPhone(rawPhone);
    if (canonicalPhone === '') {
      return { phone: rawPhone, status: 'error', message: 'Phone is required' };
    }
    try {
      const existing = await findCustomerByPhoneCandidates(
        this.customerModel,
        canonicalPhone,
      );
      if (existing != null) {
        return {
          phone: canonicalPhone,
          status: 'already_exists',
          customerId: String(existing._id),
        };
      }
      const assignedTo =
        row.assignedTo !== undefined && row.assignedTo.trim() !== ''
          ? row.assignedTo.trim()
          : undefined;
      const created = new this.customerModel({
        phone: canonicalPhone,
        whatsapp: canonicalPhone,
        ...(row.name !== undefined && row.name.trim() !== '' && { name: row.name.trim() }),
        ...(row.email !== undefined && row.email.trim() !== '' && { email: row.email.trim() }),
        ...(assignedTo !== undefined && { assignedTo }),
        interestedProjects: [],
        createdBy,
      });
      created.$locals['__auditActorUserId'] = createdBy;
      const saved = await created.save();
      return {
        phone: canonicalPhone,
        status: 'created',
        customerId: String(saved._id),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error during import';
      return { phone: canonicalPhone, status: 'error', message };
    }
  }
}
