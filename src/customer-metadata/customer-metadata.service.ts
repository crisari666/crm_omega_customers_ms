import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Customer,
  CustomerDocument,
} from '../customer/schemas/customer.schema';
import { CUSTOMER_METADATA_FIELD_CATALOG } from './catalog/customer-metadata-field.catalog';
import {
  CustomerMetadata,
  CustomerMetadataDocument,
} from './schemas/customer-metadata.schema';
import type { CustomerMetadataResponse } from './types/customer-metadata-response.type';
import {
  computeCustomerMetadataCompleteness,
  validateCustomerMetadataValues,
} from './utils/validate-customer-metadata-values.util';

/**
 * Handles Stage 3 customer metadata persistence and catalog responses.
 */
@Injectable()
export class CustomerMetadataService {
  constructor(
    @InjectModel(CustomerMetadata.name)
    private readonly customerMetadataModel: Model<CustomerMetadataDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async getByCustomerId(
    customerId: string,
  ): Promise<CustomerMetadataResponse> {
    await this.assertCustomerExists(customerId);
    const doc = await this.customerMetadataModel
      .findOne({ customerId: new Types.ObjectId(customerId) })
      .lean()
      .exec();
    const values = this.mapValuesToRecord(doc?.values);
    return this.buildResponse(customerId, values, doc);
  }

  async upsertByCustomerId(args: {
    readonly customerId: string;
    readonly values: Record<string, unknown>;
    readonly actorUserId: string;
  }): Promise<CustomerMetadataResponse> {
    await this.assertCustomerExists(args.customerId);
    const validated = validateCustomerMetadataValues(args.values);
    const customerObjectId = new Types.ObjectId(args.customerId);
    const updated = await this.customerMetadataModel
      .findOneAndUpdate(
        { customerId: customerObjectId },
        {
          $set: {
            values: validated,
            updatedBy: args.actorUserId,
          },
          $setOnInsert: {
            customerId: customerObjectId,
          },
        },
        { upsert: true, new: true, lean: true },
      )
      .exec();
    const values = this.mapValuesToRecord(updated?.values);
    return this.buildResponse(args.customerId, values, updated);
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel
      .exists({ _id: new Types.ObjectId(customerId) })
      .exec();
    if (exists === null) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
  }

  private mapValuesToRecord(
    values: Map<string, string> | Record<string, string> | undefined | null,
  ): Record<string, string> {
    if (values === undefined || values === null) {
      return {};
    }
    if (values instanceof Map) {
      return Object.fromEntries(values.entries());
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.trim() !== '') {
        result[key] = value;
      }
    }
    return result;
  }

  private buildResponse(
    customerId: string,
    values: Record<string, string>,
    doc?: {
      updatedAt?: Date | string;
      updatedBy?: string;
    } | null,
  ): CustomerMetadataResponse {
    const completeness = computeCustomerMetadataCompleteness(values);
    const updatedAtRaw = doc?.updatedAt;
    const updatedAt =
      updatedAtRaw === undefined
        ? undefined
        : updatedAtRaw instanceof Date
          ? updatedAtRaw.toISOString()
          : new Date(updatedAtRaw).toISOString();
    return {
      customerId,
      fields: CUSTOMER_METADATA_FIELD_CATALOG,
      values,
      completedRequiredCount: completeness.completedRequiredCount,
      requiredCount: completeness.requiredCount,
      isComplete: completeness.isComplete,
      ...(updatedAt !== undefined && { updatedAt }),
      ...(doc?.updatedBy !== undefined && { updatedBy: doc.updatedBy }),
    };
  }
}
