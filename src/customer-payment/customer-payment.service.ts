import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId } from 'mongoose';
import { Model } from 'mongoose';
import { join } from 'path';
import type { ReadStream } from 'fs';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { CreateCustomerPaymentMultipartDto } from './dto/create-customer-payment-multipart.dto';
import { ListCustomerPaymentsQueryDto } from './dto/list-customer-payments-query.dto';
import {
  CustomerPayment,
  CustomerPaymentDocument,
} from './schemas/customer-payment.schema';

const DEFAULT_LIMIT = 50;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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
  hasEvidence: boolean;
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
  private readonly logger = new Logger(CustomerPaymentService.name);

  private readonly evidenceDirectory: string;

  private readonly allowedEvidenceMimeTypes: readonly string[];

  constructor(
    @InjectModel(CustomerPayment.name)
    private readonly paymentModel: Model<CustomerPaymentDocument>,
    private readonly configService: ConfigService,
  ) {
    this.evidenceDirectory = this.configService.getOrThrow<string>(
      'customerPaymentEvidence.directory',
    );
    this.allowedEvidenceMimeTypes = this.configService.getOrThrow<
      readonly string[]
    >('customerPaymentEvidence.allowedMimeTypes');
  }

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

  async createPaymentWithEvidence(
    dto: CreateCustomerPaymentMultipartDto,
    file: Express.Multer.File | undefined,
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
    const paymentId = String(doc._id);
    if (!this.shouldPersistEvidence(file)) {
      return this.mapToResponse(doc);
    }
    if (!this.allowedEvidenceMimeTypes.includes(file!.mimetype)) {
      await this.paymentModel.deleteOne({ _id: doc._id }).exec();
      throw new BadRequestException('Unsupported evidence MIME type');
    }
    const ext = MIME_TO_EXT[file!.mimetype];
    if (!ext) {
      await this.paymentModel.deleteOne({ _id: doc._id }).exec();
      throw new BadRequestException('Unsupported evidence MIME type');
    }
    const evidenceStoredFileName = `${paymentId}.${ext}`;
    const absolutePath = join(this.evidenceDirectory, evidenceStoredFileName);
    try {
      await mkdir(this.evidenceDirectory, { recursive: true });
      await writeFile(absolutePath, file!.buffer);
    } catch (err) {
      this.logger.error(
        `Failed to write payment evidence for ${paymentId}: ${String(err)}`,
      );
      await this.paymentModel.deleteOne({ _id: doc._id }).exec();
      throw new BadRequestException('Could not store evidence file');
    }
    doc.evidenceMimeType = file!.mimetype;
    doc.evidenceStoredFileName = evidenceStoredFileName;
    await doc.save();
    return this.mapToResponse(doc);
  }

  async openEvidenceReadStream(
    paymentId: string,
  ): Promise<{ stream: ReadStream; mimeType: string }> {
    if (!isValidObjectId(paymentId)) {
      throw new NotFoundException();
    }
    const doc = await this.paymentModel.findById(paymentId).exec();
    if (
      !doc ||
      !doc.evidenceStoredFileName ||
      !doc.evidenceMimeType ||
      doc.evidenceStoredFileName.includes('..') ||
      doc.evidenceStoredFileName.includes('/') ||
      doc.evidenceStoredFileName.includes('\\')
    ) {
      throw new NotFoundException();
    }
    const absolutePath = join(this.evidenceDirectory, doc.evidenceStoredFileName);
    const stream = createReadStream(absolutePath);
    return { stream, mimeType: doc.evidenceMimeType };
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

  private shouldPersistEvidence(
    file: Express.Multer.File | undefined,
  ): boolean {
    if (!file || !file.buffer || file.buffer.length === 0) {
      return false;
    }
    return true;
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
    const hasEvidence = Boolean(
      o.evidenceStoredFileName &&
        o.evidenceMimeType &&
        String(o.evidenceStoredFileName).length > 0,
    );
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
      hasEvidence,
      createdAt:
        (o as { createdAt?: Date }).createdAt?.toISOString?.() ??
        String((o as { createdAt?: Date }).createdAt),
      updatedAt:
        (o as { updatedAt?: Date }).updatedAt?.toISOString?.() ??
        String((o as { updatedAt?: Date }).updatedAt),
    };
  }
}
