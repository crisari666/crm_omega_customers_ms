import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { ListCustomerPaymentsQueryDto } from './dto/list-customer-payments-query.dto';
import {
  CustomerPayment,
  CustomerPaymentDocument,
} from './schemas/customer-payment.schema';

const DEFAULT_LIMIT = 50;

export type CustomerPaymentResponse = {
  id: string;
  customerId: string;
  projectId: string;
  paymentValue: number;
  datePayment: string;
  receiptNumber?: string;
  paymentMethod?: string;
  notes?: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerPaymentSummaryItem = {
  projectId: string;
  totalPaid: number;
  paymentCount: number;
};

@Injectable()
export class CustomerPaymentService {
  constructor(
    @InjectModel(CustomerPayment.name)
    private readonly paymentModel: Model<CustomerPaymentDocument>,
  ) {}

  async createPayment(
    dto: CreateCustomerPaymentDto,
    recordedBy: string,
  ): Promise<CustomerPaymentResponse> {
    const doc = await this.paymentModel.create({
      customerId: dto.customerId,
      projectId: dto.projectId,
      paymentValue: dto.paymentValue,
      datePayment: new Date(dto.datePayment),
      receiptNumber: dto.receiptNumber,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
      recordedBy,
    });
    return this.mapToResponse(doc);
  }

  async listPayments(
    query: ListCustomerPaymentsQueryDto,
  ): Promise<{ data: CustomerPaymentResponse[]; total: number }> {
    const filter = this.buildFilter(query);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = query.skip ?? 0;
    const [docs, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort({ datePayment: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return {
      data: docs.map((d) => this.mapToResponse(d)),
      total,
    };
  }

  async listByCustomer(
    customerId: string,
  ): Promise<CustomerPaymentResponse[]> {
    const docs = await this.paymentModel
      .find({ customerId })
      .sort({ datePayment: -1 })
      .exec();
    return docs.map((d) => this.mapToResponse(d));
  }

  async getSummaryByCustomer(
    customerId: string,
  ): Promise<CustomerPaymentSummaryItem[]> {
    const result = await this.paymentModel.aggregate<CustomerPaymentSummaryItem>(
      [
        { $match: { customerId } },
        {
          $group: {
            _id: '$projectId',
            totalPaid: { $sum: '$paymentValue' },
            paymentCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            projectId: '$_id',
            totalPaid: 1,
            paymentCount: 1,
          },
        },
      ],
    );
    return result;
  }

  private buildFilter(
    query: ListCustomerPaymentsQueryDto,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (query.customerId) {
      filter.customerId = query.customerId;
    }
    if (query.projectId) {
      filter.projectId = query.projectId;
    }
    if (query.recordedBy) {
      filter.recordedBy = query.recordedBy;
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (query.dateFrom) {
        dateFilter.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        dateFilter.$lte = new Date(query.dateTo);
      }
      filter.datePayment = dateFilter;
    }
    return filter;
  }

  private mapToResponse(
    doc: CustomerPaymentDocument,
  ): CustomerPaymentResponse {
    const o = doc.toObject({ virtuals: true });
    return {
      id: String(o._id),
      customerId: o.customerId,
      projectId: o.projectId,
      paymentValue: o.paymentValue,
      datePayment: o.datePayment?.toISOString?.() ?? String(o.datePayment),
      receiptNumber: o.receiptNumber,
      paymentMethod: o.paymentMethod,
      notes: o.notes,
      recordedBy: o.recordedBy,
      createdAt:
        (o as { createdAt?: Date }).createdAt?.toISOString?.() ??
        String((o as { createdAt?: Date }).createdAt),
      updatedAt:
        (o as { updatedAt?: Date }).updatedAt?.toISOString?.() ??
        String((o as { updatedAt?: Date }).updatedAt),
    };
  }
}
