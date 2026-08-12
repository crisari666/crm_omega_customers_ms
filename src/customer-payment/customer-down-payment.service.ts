import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createReadStream } from 'fs';
import type { ReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { isValidObjectId, Model, Types } from 'mongoose';
import { join } from 'path';
import { CustomerAssignmentPushService } from '../customer/customer-assignment-push.service';
import {
  Customer,
  CustomerDocument,
} from '../customer/schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import { CUSTOMER_DOWN_PAYMENT_ALLOWED_MIME } from './customer-down-payment-file-multer-options';
import { CreateCustomerDownPaymentMultipartDto } from './dto/create-customer-down-payment-multipart.dto';
import { CreateCustomerPaymentFeeMultipartDto } from './dto/create-customer-payment-fee-multipart.dto';
import { ListCustomerDownPaymentsQueryDto } from './dto/list-customer-down-payments-query.dto';
import {
  CustomerDownPayment,
  CustomerDownPaymentDocument,
  CustomerDownPaymentStatus,
} from './schemas/customer-down-payment.schema';
import {
  CustomerPaymentFee,
  CustomerPaymentFeeDocument,
} from './schemas/customer-payment-fee.schema';
import type {
  CustomerDownPaymentResponse,
  CustomerPaymentFeeResponse,
  ListCustomerDownPaymentsResult,
} from './types/customer-down-payment.type';

const DEFAULT_LIMIT = 50;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

@Injectable()
export class CustomerDownPaymentService {
  private readonly logger = new Logger(CustomerDownPaymentService.name);
  private readonly contractDirectory: string;
  private readonly feeEvidenceDirectory: string;

  constructor(
    @InjectModel(CustomerDownPayment.name)
    private readonly downPaymentModel: Model<CustomerDownPaymentDocument>,
    @InjectModel(CustomerPaymentFee.name)
    private readonly feeModel: Model<CustomerPaymentFeeDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(VentorScheduleEvent.name)
    private readonly scheduleModel: Model<VentorScheduleEventDocument>,
    private readonly configService: ConfigService,
    private readonly assignmentPushService: CustomerAssignmentPushService,
  ) {
    this.contractDirectory = this.configService.getOrThrow<string>(
      'customerDownPayment.contractDirectory',
    );
    this.feeEvidenceDirectory = this.configService.getOrThrow<string>(
      'customerDownPayment.feeEvidenceDirectory',
    );
  }

  async createDownPaymentWithFiles(params: {
    readonly dto: CreateCustomerDownPaymentMultipartDto;
    readonly contract: Express.Multer.File | undefined;
    readonly evidence: Express.Multer.File | undefined;
    readonly recordedBy: string;
  }): Promise<CustomerDownPaymentResponse> {
    const { dto, contract, evidence, recordedBy } = params;
    this.assertRequiredContract(contract);
    if (dto.firstPaymentValue > dto.expectedValue) {
      throw new BadRequestException(
        'First payment cannot exceed expected down payment value',
      );
    }
    const existing = await this.downPaymentModel
      .findOne({ customerId: dto.customerId, projectId: dto.projectId })
      .select({ _id: 1 })
      .lean()
      .exec();
    if (existing != null) {
      throw new ConflictException(
        'A down payment already exists for this customer and project. Only fee payments can be added until the expected value is reached.',
      );
    }
    const customerName =
      (dto.customerName ?? '').trim() ||
      (await this.resolveCustomerDisplayName(dto.customerId));
    const projectName = (dto.projectName ?? '').trim();
    const status =
      dto.firstPaymentValue >= dto.expectedValue
        ? CustomerDownPaymentStatus.Completed
        : CustomerDownPaymentStatus.Pending;
    const downPayment = await this.downPaymentModel.create({
      customerId: dto.customerId,
      projectId: dto.projectId,
      lotNumber: dto.lotNumber.trim(),
      expectedValue: dto.expectedValue,
      status,
      totalPaid: 0,
      feeCount: 0,
      customerName: customerName || undefined,
      projectName: projectName || undefined,
      contractMimeType: 'pending',
      contractStoredFileName: 'pending',
      recordedBy,
    });
    const downPaymentId = String(downPayment._id);
    try {
      const contractMeta = await this.persistFile({
        file: contract!,
        directory: this.contractDirectory,
        idPrefix: downPaymentId,
        label: 'contract',
      });
      downPayment.contractMimeType = contractMeta.mimeType;
      downPayment.contractStoredFileName = contractMeta.storedFileName;
      await downPayment.save();
      const fee = await this.feeModel.create({
        downPaymentId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        paymentValue: dto.firstPaymentValue,
        datePayment: new Date(dto.datePayment),
        receiptNumber: dto.receiptNumber,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        recordedBy,
      });
      if (this.shouldPersistFile(evidence)) {
        const evidenceMeta = await this.persistFile({
          file: evidence!,
          directory: this.feeEvidenceDirectory,
          idPrefix: String(fee._id),
          label: 'fee evidence',
        });
        fee.evidenceMimeType = evidenceMeta.mimeType;
        fee.evidenceStoredFileName = evidenceMeta.storedFileName;
        await fee.save();
      }
      downPayment.totalPaid = dto.firstPaymentValue;
      downPayment.feeCount = 1;
      downPayment.status =
        downPayment.totalPaid >= downPayment.expectedValue
          ? CustomerDownPaymentStatus.Completed
          : CustomerDownPaymentStatus.Pending;
      await downPayment.save();
      void this.notifyDownPaymentCreated(downPayment);
      const fees = [this.mapFeeToResponse(fee)];
      return this.mapDownPaymentToResponse(downPayment, fees);
    } catch (err: unknown) {
      await this.feeModel.deleteMany({ downPaymentId }).exec();
      await this.downPaymentModel.deleteOne({ _id: downPayment._id }).exec();
      throw err;
    }
  }

  async addFeeWithOptionalEvidence(params: {
    readonly downPaymentId: string;
    readonly dto: CreateCustomerPaymentFeeMultipartDto;
    readonly evidence: Express.Multer.File | undefined;
    readonly recordedBy: string;
  }): Promise<CustomerDownPaymentResponse> {
    const { downPaymentId, dto, evidence, recordedBy } = params;
    if (!isValidObjectId(downPaymentId)) {
      throw new NotFoundException();
    }
    const downPayment = await this.downPaymentModel.findById(downPaymentId).exec();
    if (downPayment == null) {
      throw new NotFoundException();
    }
    const remaining = Math.max(
      downPayment.expectedValue - downPayment.totalPaid,
      0,
    );
    if (remaining <= 0) {
      throw new BadRequestException('Down payment is already completed');
    }
    if (dto.paymentValue > remaining) {
      throw new BadRequestException(
        `Payment exceeds remaining amount (${remaining})`,
      );
    }
    const fee = await this.feeModel.create({
      downPaymentId,
      customerId: downPayment.customerId,
      projectId: downPayment.projectId,
      paymentValue: dto.paymentValue,
      datePayment: new Date(dto.datePayment),
      receiptNumber: dto.receiptNumber,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
      recordedBy,
    });
    if (this.shouldPersistFile(evidence)) {
      try {
        const evidenceMeta = await this.persistFile({
          file: evidence!,
          directory: this.feeEvidenceDirectory,
          idPrefix: String(fee._id),
          label: 'fee evidence',
        });
        fee.evidenceMimeType = evidenceMeta.mimeType;
        fee.evidenceStoredFileName = evidenceMeta.storedFileName;
        await fee.save();
      } catch (err: unknown) {
        await this.feeModel.deleteOne({ _id: fee._id }).exec();
        throw err;
      }
    }
    downPayment.totalPaid += dto.paymentValue;
    downPayment.feeCount += 1;
    downPayment.status =
      downPayment.totalPaid >= downPayment.expectedValue
        ? CustomerDownPaymentStatus.Completed
        : CustomerDownPaymentStatus.Pending;
    await downPayment.save();
    const fees = await this.listFeesForDownPayment(downPaymentId);
    return this.mapDownPaymentToResponse(downPayment, fees);
  }

  async listByCustomer(
    customerId: string,
  ): Promise<CustomerDownPaymentResponse[]> {
    const docs = await this.downPaymentModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .exec();
    const result: CustomerDownPaymentResponse[] = [];
    for (const doc of docs) {
      const fees = await this.listFeesForDownPayment(String(doc._id));
      result.push(this.mapDownPaymentToResponse(doc, fees));
    }
    return result;
  }

  async listDownPayments(
    query: ListCustomerDownPaymentsQueryDto,
  ): Promise<ListCustomerDownPaymentsResult> {
    const filter = this.buildListFilter(query);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = query.skip ?? 0;
    const [docs, total] = await Promise.all([
      this.downPaymentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.downPaymentModel.countDocuments(filter).exec(),
    ]);
    const data = docs.map((doc) => this.mapDownPaymentToResponse(doc));
    return { data, total };
  }

  async listFeesForDownPayment(
    downPaymentId: string,
  ): Promise<CustomerPaymentFeeResponse[]> {
    const docs = await this.feeModel
      .find({ downPaymentId })
      .sort({ datePayment: -1, createdAt: -1 })
      .exec();
    return docs.map((d) => this.mapFeeToResponse(d));
  }

  async openContractReadStream(
    downPaymentId: string,
  ): Promise<{ stream: ReadStream; mimeType: string }> {
    if (!isValidObjectId(downPaymentId)) {
      throw new NotFoundException();
    }
    const doc = await this.downPaymentModel.findById(downPaymentId).exec();
    if (
      doc == null ||
      !this.isSafeStoredName(doc.contractStoredFileName) ||
      !doc.contractMimeType
    ) {
      throw new NotFoundException();
    }
    const absolutePath = join(
      this.contractDirectory,
      doc.contractStoredFileName,
    );
    return {
      stream: createReadStream(absolutePath),
      mimeType: doc.contractMimeType,
    };
  }

  async openFeeEvidenceReadStream(
    feeId: string,
  ): Promise<{ stream: ReadStream; mimeType: string }> {
    if (!isValidObjectId(feeId)) {
      throw new NotFoundException();
    }
    const doc = await this.feeModel.findById(feeId).exec();
    if (
      doc == null ||
      !doc.evidenceStoredFileName ||
      !doc.evidenceMimeType ||
      !this.isSafeStoredName(doc.evidenceStoredFileName)
    ) {
      throw new NotFoundException();
    }
    const absolutePath = join(
      this.feeEvidenceDirectory,
      doc.evidenceStoredFileName,
    );
    return {
      stream: createReadStream(absolutePath),
      mimeType: doc.evidenceMimeType,
    };
  }

  async getFeeCustomerId(feeId: string): Promise<string> {
    if (!isValidObjectId(feeId)) {
      throw new NotFoundException();
    }
    const doc = await this.feeModel
      .findById(feeId)
      .select({ customerId: 1 })
      .lean()
      .exec();
    if (doc == null) {
      throw new NotFoundException();
    }
    return doc.customerId;
  }

  async getDownPaymentCustomerId(downPaymentId: string): Promise<string> {
    if (!isValidObjectId(downPaymentId)) {
      throw new NotFoundException();
    }
    const doc = await this.downPaymentModel
      .findById(downPaymentId)
      .select({ customerId: 1 })
      .lean()
      .exec();
    if (doc == null) {
      throw new NotFoundException();
    }
    return doc.customerId;
  }

  private async notifyDownPaymentCreated(
    downPayment: CustomerDownPaymentDocument,
  ): Promise<void> {
    try {
      const recipientIds = await this.resolveRelatedAgentIds(
        downPayment.customerId,
      );
      await this.assignmentPushService.executeNotifyDownPaymentCreated({
        customerId: downPayment.customerId,
        lotNumber: downPayment.lotNumber,
        projectName: downPayment.projectName ?? downPayment.projectId,
        customerName: downPayment.customerName ?? '',
        recipientUserIds: recipientIds,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Down payment push failed id=${String(downPayment._id)}: ${message}`,
      );
    }
  }

  private async resolveRelatedAgentIds(
    customerId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (!isValidObjectId(customerId)) {
      return [];
    }
    const customer = await this.customerModel
      .findById(customerId)
      .select({ assignedTo: 1 })
      .lean()
      .exec();
    const assigned = (customer?.assignedTo ?? '').trim();
    if (assigned !== '') {
      ids.add(assigned);
    }
    const events = await this.scheduleModel
      .find({
        customerId: new Types.ObjectId(customerId),
        onLandAgentUserId: { $exists: true, $nin: [null, ''] },
      })
      .select({ onLandAgentUserId: 1 })
      .lean()
      .exec();
    for (const event of events) {
      const agent = (event.onLandAgentUserId ?? '').trim();
      if (agent !== '') {
        ids.add(agent);
      }
    }
    return [...ids];
  }

  private async resolveCustomerDisplayName(
    customerId: string,
  ): Promise<string> {
    if (!isValidObjectId(customerId)) {
      return '';
    }
    const customer = await this.customerModel
      .findById(customerId)
      .select({ name: 1, lastName: 1 })
      .lean()
      .exec();
    if (customer == null) {
      return '';
    }
    return `${customer.name ?? ''} ${customer.lastName ?? ''}`.trim();
  }

  private assertRequiredContract(
    contract: Express.Multer.File | undefined,
  ): void {
    if (!this.shouldPersistFile(contract)) {
      throw new BadRequestException('Contract file is required');
    }
    if (!CUSTOMER_DOWN_PAYMENT_ALLOWED_MIME.has(contract!.mimetype)) {
      throw new BadRequestException('Unsupported contract MIME type');
    }
  }

  private shouldPersistFile(file: Express.Multer.File | undefined): boolean {
    return Boolean(file && file.buffer && file.buffer.length > 0);
  }

  private async persistFile(params: {
    readonly file: Express.Multer.File;
    readonly directory: string;
    readonly idPrefix: string;
    readonly label: string;
  }): Promise<{ mimeType: string; storedFileName: string }> {
    if (!CUSTOMER_DOWN_PAYMENT_ALLOWED_MIME.has(params.file.mimetype)) {
      throw new BadRequestException(`Unsupported ${params.label} MIME type`);
    }
    const ext = MIME_TO_EXT[params.file.mimetype];
    if (!ext) {
      throw new BadRequestException(`Unsupported ${params.label} MIME type`);
    }
    const storedFileName = `${params.idPrefix}.${ext}`;
    const absolutePath = join(params.directory, storedFileName);
    try {
      await mkdir(params.directory, { recursive: true });
      await writeFile(absolutePath, params.file.buffer);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to write ${params.label} ${params.idPrefix}: ${String(err)}`,
      );
      throw new BadRequestException(`Could not store ${params.label} file`);
    }
    return { mimeType: params.file.mimetype, storedFileName };
  }

  private isSafeStoredName(name: string): boolean {
    return (
      name.length > 0 &&
      !name.includes('..') &&
      !name.includes('/') &&
      !name.includes('\\')
    );
  }

  private buildListFilter(
    query: ListCustomerDownPaymentsQueryDto,
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
    if (query.status) {
      filter.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (query.dateFrom) {
        dateFilter.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        dateFilter.$lte = new Date(query.dateTo);
      }
      filter.createdAt = dateFilter;
    }
    return filter;
  }

  private mapDownPaymentToResponse(
    doc: CustomerDownPaymentDocument,
    fees?: CustomerPaymentFeeResponse[],
  ): CustomerDownPaymentResponse {
    const o = doc.toObject({ virtuals: true });
    const expectedValue = o.expectedValue ?? 0;
    const totalPaid = o.totalPaid ?? 0;
    return {
      id: String(o._id),
      customerId: o.customerId,
      projectId: o.projectId,
      lotNumber: o.lotNumber,
      expectedValue,
      status: o.status,
      totalPaid,
      feeCount: o.feeCount ?? 0,
      remaining: Math.max(expectedValue - totalPaid, 0),
      customerName: o.customerName,
      projectName: o.projectName,
      recordedBy: o.recordedBy,
      hasContract: Boolean(
        o.contractStoredFileName &&
          o.contractMimeType &&
          o.contractStoredFileName !== 'pending',
      ),
      contractMimeType:
        o.contractStoredFileName !== 'pending' ? o.contractMimeType : undefined,
      createdAt:
        (o as { createdAt?: Date }).createdAt?.toISOString?.() ??
        String((o as { createdAt?: Date }).createdAt),
      updatedAt:
        (o as { updatedAt?: Date }).updatedAt?.toISOString?.() ??
        String((o as { updatedAt?: Date }).updatedAt),
      fees,
    };
  }

  private mapFeeToResponse(
    doc: CustomerPaymentFeeDocument,
  ): CustomerPaymentFeeResponse {
    const o = doc.toObject({ virtuals: true });
    const hasEvidence = Boolean(
      o.evidenceStoredFileName &&
        o.evidenceMimeType &&
        String(o.evidenceStoredFileName).length > 0,
    );
    return {
      id: String(o._id),
      downPaymentId: o.downPaymentId,
      customerId: o.customerId,
      projectId: o.projectId,
      paymentValue: o.paymentValue,
      datePayment: o.datePayment?.toISOString?.() ?? String(o.datePayment),
      receiptNumber: o.receiptNumber,
      paymentMethod: o.paymentMethod,
      notes: o.notes,
      recordedBy: o.recordedBy,
      hasEvidence,
      evidenceMimeType: hasEvidence ? o.evidenceMimeType : undefined,
      createdAt:
        (o as { createdAt?: Date }).createdAt?.toISOString?.() ??
        String((o as { createdAt?: Date }).createdAt),
      updatedAt:
        (o as { updatedAt?: Date }).updatedAt?.toISOString?.() ??
        String((o as { updatedAt?: Date }).updatedAt),
    };
  }
}
