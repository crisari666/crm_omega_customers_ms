import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PipelineStage } from 'mongoose';
import { Model, Types } from 'mongoose';
import { AddCustomerDescriptionDto } from './dto/add-customer-description.dto';
import { AddInterestedProjectDto } from './dto/add-interested-project.dto';
import { AssignCustomerAssigneeDto } from './dto/assign-customer-assignee.dto';
import { CreateCustomerAdminDto } from './dto/create-customer-admin.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersAdminQueryDto } from './dto/list-customers-admin.query.dto';
import { UpdateCustomerAdminDto } from './dto/update-customer-admin.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerAuditService } from './customer-audit.service';
import {
  CustomerAdminListItem,
  CustomerAdminListResponse,
  CustomerStepDistributionItem,
} from './types/customer-admin-list-item.type';
import type { CustomerAdminDetail } from './types/customer-admin-detail.type';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
  VentorScheduleEventStatus,
  VentorScheduleEventType,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';
import {
  CustomerStepUpdateLog,
  CustomerStepUpdateLogDocument,
} from './schemas/customer-step-update-log.schema';
import {
  CustomerDescription,
  CustomerDescriptionDocument,
} from './schemas/descriptions.schema';
import {
  CustomerStep,
  CustomerStepDocument,
} from '../customer-steps/schemas/customer-step.schema';
import { normalizeCustomerPhone } from './utils/normalize-customer-phone.util';

const DUPLICATE_PHONE_MESSAGE =
  'Ya existe un cliente con este número de teléfono.';

function isMongoDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

/** Lean row after admin list aggregation ($lookup customer_steps). */
type AdminListAggRow = {
  _id: Types.ObjectId;
  name?: string;
  lastName?: string;
  phone: string;
  email?: string;
  assignedTo?: string;
  createdBy?: string;
  customerStepId?: Types.ObjectId;
  enabled?: boolean;
  createdAt?: Date;
  __stepName?: string;
  __stepColor?: string;
};
type StepDistributionAggRow = {
  _id: Types.ObjectId | null;
  count: number;
  __stepName?: string;
  __stepColor?: string;
};
type NormalizeAllContactsResult = {
  total: number;
  updated: number;
  unchanged: number;
  conflicts: number;
};

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(VentorScheduleEvent.name)
    private readonly ventorScheduleEventModel: Model<VentorScheduleEventDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerDescription.name)
    private readonly customerDescriptionModel: Model<CustomerDescriptionDocument>,
    @InjectModel(CustomerStep.name)
    private readonly customerStepModel: Model<CustomerStepDocument>,
    @InjectModel(CustomerStepUpdateLog.name)
    private readonly customerStepUpdateLogModel: Model<CustomerStepUpdateLogDocument>,
    private readonly customerAuditService: CustomerAuditService,
  ) {}

  executePing(): string {
    return 'ok';
  }

  normalizeCustomerContactNumbers(input: {
    phone?: string;
    whatsapp?: string;
  }): { phone: string; whatsapp: string } {
    const normalizedPhone =
      input.phone !== undefined ? normalizeCustomerPhone(input.phone) : '';
    const normalizedWhatsapp =
      input.whatsapp !== undefined ? normalizeCustomerPhone(input.whatsapp) : '';
    if (normalizedPhone !== '') {
      return { phone: normalizedPhone, whatsapp: normalizedPhone };
    }
    if (normalizedWhatsapp !== '') {
      return { phone: normalizedWhatsapp, whatsapp: normalizedWhatsapp };
    }
    return { phone: '', whatsapp: '' };
  }

  /**
   * Normalizes all customer contact numbers by removing spaces and `+`.
   * When normalized values collide with unique `phone`, the record is skipped.
   */
  async normalizeAllCustomerContactNumbers(): Promise<NormalizeAllContactsResult> {
    const customers = await this.customerModel.find().select('phone whatsapp').exec();
    let updated = 0;
    let unchanged = 0;
    let conflicts = 0;
    for (const customer of customers) {
      const normalized = this.normalizeCustomerContactNumbers({
        phone: customer.phone,
        whatsapp: customer.whatsapp,
      });
      const currentPhone = customer.phone ?? '';
      const currentWhatsapp = customer.whatsapp ?? '';
      const hasChanges =
        currentPhone !== normalized.phone || currentWhatsapp !== normalized.whatsapp;
      if (!hasChanges) {
        unchanged += 1;
        continue;
      }
      customer.phone = normalized.phone;
      customer.whatsapp = normalized.whatsapp;
      try {
        await customer.save();
        updated += 1;
      } catch (err) {
        if (isMongoDuplicateKeyError(err)) {
          conflicts += 1;
          continue;
        }
        throw err;
      }
    }
    return { total: customers.length, updated, unchanged, conflicts };
  }

  async findCustomersCreatedBy(createdBy: string): Promise<CustomerDocument[]> {
    return this.customerModel
      .find({ $or: [{ createdBy }, { assignedTo: createdBy }] })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Ventor dashboard: customers this user created with a non-empty assignee, and
   * distinct customers (same creator filter) with a completed in-office schedule event.
   */
  async getVendorMineDashboardStats(userId: string): Promise<{
    customersActives: number;
    customerConversion: number;
  }> {
    const enabledOk = {
      $or: [{ enabled: true }, { enabled: { $exists: false } }],
    };
    const customersActives = await this.customerModel.countDocuments({
      createdBy: userId,
      assignedTo: { $exists: true, $nin: [null, ''] },
      ...enabledOk,
    });

    const customerColl = this.customerModel.collection.name;
    const convAgg = await this.ventorScheduleEventModel
      .aggregate<{ n: number }>([
        {
          $match: {
            userId,
            eventType: VentorScheduleEventType.Office,
            status: VentorScheduleEventStatus.Done,
          },
        },
        {
          $lookup: {
            from: customerColl,
            let: { cid: '$customerId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$cid'] },
                  createdBy: userId,
                },
              },
            ],
            as: 'cust',
          },
        },
        { $match: { cust: { $ne: [] } } },
        { $group: { _id: '$customerId' } },
        { $count: 'n' },
      ])
      .exec();

    const customerConversion = convAgg[0]?.n ?? 0;
    return { customersActives, customerConversion };
  }

  /**
   * Admin list with filters; returns only fields needed for CRM table display.
   * Single aggregation: match + facet (count + paginated rows with step lookup).
   */
  async listCustomersAdmin(
    query: ListCustomersAdminQueryDto,
  ): Promise<CustomerAdminListResponse> {
    const filter = this.buildAdminListFilter(query);
    const limit = query.limit ?? 50;
    const skip = query.skip ?? 0;

    type FacetBucket = {
      meta: { total: number }[];
      rows: AdminListAggRow[];
      stepDistribution: StepDistributionAggRow[];
    };

    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $facet: {
          meta: [{ $count: 'total' }],
          rows: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'customer_steps',
                localField: 'customerStepId',
                foreignField: '_id',
                as: '_stepJoin',
              },
            },
            {
              $set: {
                __stepName: { $arrayElemAt: ['$_stepJoin.name', 0] },
                __stepColor: { $arrayElemAt: ['$_stepJoin.color', 0] },
              },
            },
            {
              // Inclusion-only: `_stepJoin` omitted (cannot mix field:0 with field:1).
              $project: {
                _id: 1,
                name: 1,
                lastName: 1,
                phone: 1,
                email: 1,
                assignedTo: 1,
                createdBy: 1,
                customerStepId: 1,
                enabled: 1,
                createdAt: 1,
                __stepName: 1,
                __stepColor: 1,
              },
            },
          ],
          stepDistribution: [
            {
              $group: {
                _id: '$customerStepId',
                count: { $sum: 1 },
              },
            },
            {
              $lookup: {
                from: 'customer_steps',
                localField: '_id',
                foreignField: '_id',
                as: '_stepJoin',
              },
            },
            {
              $set: {
                __stepName: { $arrayElemAt: ['$_stepJoin.name', 0] },
                __stepColor: { $arrayElemAt: ['$_stepJoin.color', 0] },
              },
            },
            {
              $project: {
                _id: 1,
                count: 1,
                __stepName: 1,
                __stepColor: 1,
              },
            },
            { $sort: { count: -1 } },
          ],
        },
      },
    ];

    const agg = await this.customerModel.aggregate<FacetBucket>(pipeline).exec();
    const bucket = agg[0];
    const total = bucket?.meta[0]?.total ?? 0;
    const rows = bucket?.rows ?? [];
    const stepDistributionRows = bucket?.stepDistribution ?? [];

    const items = rows.map((doc) => this.mapAdminListAggRowToItem(doc));
    const stepDistribution = stepDistributionRows.map((doc) =>
      this.mapStepDistributionAggRowToItem(doc),
    );
    return { items, total, stepDistribution };
  }

  private mapAdminListAggRowToItem(doc: AdminListAggRow): CustomerAdminListItem {
    const sid = doc.customerStepId
      ? String(doc.customerStepId)
      : undefined;
    const stepName =
      typeof doc.__stepName === 'string' && doc.__stepName.trim() !== ''
        ? doc.__stepName.trim()
        : undefined;
    const stepColor =
      typeof doc.__stepColor === 'string' && doc.__stepColor.trim() !== ''
        ? doc.__stepColor.trim()
        : undefined;

    const createdRaw = doc.createdAt;
    const createdAt =
      createdRaw instanceof Date
        ? createdRaw.toISOString()
        : new Date(createdRaw as string).toISOString();

    const item: CustomerAdminListItem = {
      id: String(doc._id),
      name: doc.name,
      lastName: doc.lastName,
      phone: doc.phone,
      email: doc.email,
      assignedTo: doc.assignedTo,
      createdBy: doc.createdBy,
      enabled: doc.enabled !== false,
      createdAt,
    };
    if (sid !== undefined) {
      item.customerStepId = sid;
    }
    if (sid !== undefined && stepName !== undefined) {
      item.currentStep = stepName;
    }
    if (sid !== undefined && stepColor !== undefined) {
      item.currentStepColor = stepColor;
    }
    return item;
  }

  private mapStepDistributionAggRowToItem(
    doc: StepDistributionAggRow,
  ): CustomerStepDistributionItem {
    const customerStepId = doc._id !== null ? String(doc._id) : null;
    const hasStepName =
      typeof doc.__stepName === 'string' && doc.__stepName.trim() !== '';
    const hasStepColor =
      typeof doc.__stepColor === 'string' && doc.__stepColor.trim() !== '';
    return {
      customerStepId,
      name: hasStepName ? doc.__stepName!.trim() : 'Sin paso',
      ...(hasStepColor ? { color: doc.__stepColor!.trim() } : {}),
      count: doc.count,
    };
  }

  private buildAdminListFilter(
    query: ListCustomersAdminQueryDto,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    const useDateRange =
      query.omitDateRange !== true &&
      (query.createdFrom !== undefined || query.createdTo !== undefined);
    if (useDateRange) {
      const createdAt: Record<string, Date> = {};
      if (query.createdFrom !== undefined) {
        createdAt.$gte = new Date(query.createdFrom);
      }
      if (query.createdTo !== undefined) {
        createdAt.$lte = new Date(query.createdTo);
      }
      filter.createdAt = createdAt;
    }

    const hasAssignedTo =
      query.assignedTo !== undefined &&
      query.assignedTo !== null &&
      query.assignedTo.trim() !== '';

    const q = query.search?.trim();
    const searchClause =
      q !== undefined && q !== ''
        ? (() => {
            const escaped = this.escapeRegex(q);
            const rx = new RegExp(escaped, 'i');
            return {
              $or: [
                { name: rx },
                { lastName: rx },
                { email: rx },
                { phone: rx },
              ],
            };
          })()
        : null;

    const unassignedClause =
      !hasAssignedTo && query.unassignedOnly === true
        ? {
            $or: [
              { assignedTo: { $exists: false } },
              { assignedTo: null },
              { assignedTo: '' },
            ],
          }
        : null;

    if (hasAssignedTo) {
      filter.assignedTo = query.assignedTo!.trim();
      if (searchClause !== null) {
        filter.$or = searchClause.$or;
      }
    } else if (unassignedClause !== null && searchClause !== null) {
      filter.$and = [unassignedClause, searchClause];
    } else if (unassignedClause !== null) {
      filter.$or = unassignedClause.$or;
    } else if (searchClause !== null) {
      filter.$or = searchClause.$or;
    }

    const stepId = query.customerStepId?.trim();
    if (stepId !== undefined && stepId !== '') {
      filter.customerStepId = new Types.ObjectId(stepId);
    }

    const enabledClause =
      query.enabled === true
        ? {
            $or: [{ enabled: true }, { enabled: { $exists: false } }],
          }
        : query.enabled === false
          ? { enabled: false }
          : null;

    if (enabledClause !== null) {
      return this.mergeFilterWithClause(filter, enabledClause);
    }

    return filter;
  }

  private mergeFilterWithClause(
    base: Record<string, unknown>,
    clause: Record<string, unknown>,
  ): Record<string, unknown> {
    if (Object.keys(base).length === 0) {
      return clause;
    }
    return { $and: [base, clause] };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async getCustomerById(customerId: string): Promise<CustomerDocument> {
    const customer = await this.customerModel
      .findById(customerId)
      .populate('description')
      .exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    return customer;
  }

  /**
   * Admin CRM: full customer row with populated notes (`customer_descriptions`).
   */
  async getCustomerAdminDetail(customerId: string): Promise<CustomerAdminDetail> {
    const raw = await this.customerModel.findById(customerId).lean().exec();
    if (!raw || typeof raw !== 'object' || !('_id' in raw)) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    const noteDocs = await this.customerDescriptionModel
      .find({ customerId: new Types.ObjectId(customerId) })
      .sort({ date: -1 })
      .lean()
      .exec();
    const notes = noteDocs.map((d) => ({
      id: String(d._id),
      user: d.user,
      date:
        d.date instanceof Date
          ? d.date.toISOString()
          : new Date(String(d.date)).toISOString(),
      description: d.description,
    }));
    const r = raw as unknown as Record<string, unknown> & { _id: Types.ObjectId };
    const interestedProjects = ((r.interestedProjects ?? []) as {
      projectId: string;
      date: Date | string;
      addedBy?: string;
    }[]).map(
      (p: {
        projectId: string;
        date: Date | string;
        addedBy?: string;
      }) => ({
        projectId: p.projectId,
        date:
          p.date instanceof Date
            ? p.date.toISOString()
            : new Date(String(p.date)).toISOString(),
        ...(p.addedBy !== undefined && { addedBy: p.addedBy }),
      }),
    );
    const createdAtRaw = r.createdAt as Date | string | undefined;
    const updatedAtRaw = r.updatedAt as Date | string | undefined;
    return {
      id: String(r._id),
      ...(r.name !== undefined && r.name !== null && { name: r.name as string }),
      ...(r.lastName !== undefined &&
        r.lastName !== null && { lastName: r.lastName as string }),
      phone: String(r.phone ?? ''),
      ...(r.whatsapp !== undefined &&
        r.whatsapp !== '' && { whatsapp: r.whatsapp as string }),
      ...(r.email !== undefined &&
        r.email !== '' && { email: r.email as string }),
      ...(r.documentType !== undefined && {
        documentType: r.documentType as CustomerAdminDetail['documentType'],
      }),
      ...(r.document !== undefined &&
        r.document !== '' && { document: r.document as string }),
      interestedProjects,
      ...(r.assignedTo !== undefined &&
        r.assignedTo !== null &&
        String(r.assignedTo).trim() !== '' && {
          assignedTo: String(r.assignedTo),
        }),
      enabled: r.enabled !== false,
      createdBy: String(r.createdBy ?? ''),
      createdAt:
        createdAtRaw instanceof Date
          ? createdAtRaw.toISOString()
          : new Date(String(createdAtRaw ?? Date.now())).toISOString(),
      ...(updatedAtRaw !== undefined && {
        updatedAt:
          updatedAtRaw instanceof Date
            ? updatedAtRaw.toISOString()
            : new Date(String(updatedAtRaw)).toISOString(),
      }),
      notes,
    };
  }

  /**
   * Admin CRM: partial update including `enabled`.
   */
  async updateCustomerAdmin(
    customerId: string,
    dto: UpdateCustomerAdminDto,
    actorUserId: string,
  ): Promise<CustomerAdminDetail> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    customer.$locals['__auditActorUserId'] = actorUserId;
    if (dto.name !== undefined) {
      customer.name = dto.name;
    }
    if (dto.lastName !== undefined) {
      customer.lastName = dto.lastName;
    }
    if (dto.phone !== undefined) {
      const p = this.normalizeCustomerContactNumbers({
        phone: dto.phone,
      }).phone;
      customer.phone = p;
      customer.whatsapp = p;
    } else if (dto.whatsapp !== undefined) {
      const w = this.normalizeCustomerContactNumbers({
        whatsapp: dto.whatsapp,
      }).whatsapp;
      customer.phone = w;
      customer.whatsapp = w;
    }
    if (dto.email !== undefined) {
      customer.email = dto.email;
    }
    if (dto.documentType !== undefined) {
      customer.documentType = dto.documentType;
    }
    if (dto.document !== undefined) {
      customer.document = dto.document;
    }
    if (dto.interestedProjects !== undefined) {
      const previous = customer.interestedProjects ?? [];
      customer.interestedProjects = dto.interestedProjects.map((entry) => {
        const prev = previous.find((p) => p.projectId === entry.projectId);
        return {
          projectId: entry.projectId,
          date: entry.date ? new Date(entry.date) : new Date(),
          ...(prev?.addedBy !== undefined && { addedBy: prev.addedBy }),
        };
      });
    }
    if (dto.assignedTo !== undefined) {
      const t = dto.assignedTo.trim();
      customer.assignedTo = t === '' ? undefined : t;
      customer.assignedDate = new Date().toISOString();

    }
    if (dto.enabled !== undefined) {
      customer.enabled = dto.enabled;
    }
    try {
      await customer.save();
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
      }
      throw err;
    }
    return this.getCustomerAdminDetail(customerId);
  }

  async createCustomer(
    dto: CreateCustomerDto,
    createdBy: string,
  ): Promise<CustomerDocument> {
    const interestedProjects =
      dto.interestedProjects?.map((entry) => ({
        projectId: entry.projectId,
        date: entry.date ? new Date(entry.date) : new Date(),
        addedBy: createdBy,
      })) ?? [];
    const canonicalPhone = this.normalizeCustomerContactNumbers({
      phone: dto.phone,
    }).phone;
    const created = new this.customerModel({
      name: dto.name,
      lastName: dto.lastName,
      phone: canonicalPhone,
      whatsapp: canonicalPhone,
      email: dto.email,
      documentType: dto.documentType,
      document: dto.document,
      interestedProjects,
      assignedTo: dto.assignedTo,
      createdBy,
    });
    created.$locals['__auditActorUserId'] = createdBy;
    try {
      return await created.save();
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
      }
      throw err;
    }
  }

  /**
   * Creates a customer with only phone required; optional assignee from `user` → assignedTo.
   * Optional `note` creates an initial description row; optional `projectId` seeds `interestedProjects`.
   */
  async createCustomerAdmin(
    dto: CreateCustomerAdminDto,
    createdBy: string,
  ): Promise<CustomerDocument> {
    const interestedProjects =
      dto.projectId !== undefined && dto.projectId.trim() !== ''
        ? [
            {
              projectId: dto.projectId.trim(),
              date: new Date(),
              addedBy: createdBy,
            },
          ]
        : [];
    const canonicalPhone = this.normalizeCustomerContactNumbers({
      phone: dto.phone,
    }).phone;
    const created = new this.customerModel({
      phone: canonicalPhone,
      whatsapp: canonicalPhone,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.user !== undefined && dto.user !== '' && { assignedTo: dto.user }),
      interestedProjects,
      createdBy,
    });
    created.$locals['__auditActorUserId'] = createdBy;
    let saved: CustomerDocument;
    try {
      saved = await created.save();
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
      }
      throw err;
    }
    const noteText = dto.note?.trim();
    if (noteText) {
      const beforeDesc = (saved.description ?? []).map((id) => String(id));
      const descDoc = await new this.customerDescriptionModel({
        customerId: saved._id,
        user: createdBy,
        date: new Date(),
        description: noteText,
      }).save();
      await this.customerModel
        .findByIdAndUpdate(saved._id, {
          $push: { description: descDoc._id },
        })
        .exec();
      const afterDesc = [...beforeDesc, String(descDoc._id)];
      await this.customerAuditService.recordArrayOrQueryUpdate({
        customerId: String(saved._id),
        actorUserId: createdBy,
        summaryField: 'description',
        from: beforeDesc,
        to: afterDesc,
      });
    }
    const updated = await this.customerModel.findById(saved._id).exec();
    return updated ?? saved;
  }

  async updateCustomer(
    customerId: string,
    dto: UpdateCustomerDto,
    actorUserId: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    customer.$locals['__auditActorUserId'] = actorUserId;
    if (dto.name !== undefined) {
      customer.name = dto.name;
    }
    if (dto.lastName !== undefined) {
      customer.lastName = dto.lastName;
    }
    if (dto.phone !== undefined) {
      const p = this.normalizeCustomerContactNumbers({
        phone: dto.phone,
      }).phone;
      customer.phone = p;
      customer.whatsapp = p;
    } else if (dto.whatsapp !== undefined) {
      const w = this.normalizeCustomerContactNumbers({
        whatsapp: dto.whatsapp,
      }).whatsapp;
      customer.phone = w;
      customer.whatsapp = w;
    }
    if (dto.email !== undefined) {
      customer.email = dto.email;
    }
    if (dto.documentType !== undefined) {
      customer.documentType = dto.documentType;
    }
    if (dto.document !== undefined) {
      customer.document = dto.document;
    }
    if (dto.interestedProjects !== undefined) {
      customer.interestedProjects = dto.interestedProjects.map((entry) => ({
        projectId: entry.projectId,
        date: entry.date ? new Date(entry.date) : new Date(),
      }));
    }
    if (dto.assignedTo !== undefined) {
      customer.assignedTo = dto.assignedTo;
      customer.assignedDate = new Date().toISOString();
    }
    try {
      return await customer.save();
    } catch (err) {
      if (isMongoDuplicateKeyError(err)) {
        throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
      }
      throw err;
    }
  }

  /**
   * Assigns pipeline step only; appends {@link CustomerStepUpdateLog} when the step changes.
   */
  async setCustomerStep(
    customerId: string,
    customerStepId: string,
    actorUserId: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    const nextStepId = await this.resolveCustomerStepObjectId(customerStepId);
    if (nextStepId === undefined) {
      throw new BadRequestException('customerStepId is required');
    }
    const prevId = customer.customerStepId
      ? String(customer.customerStepId)
      : '';
    const nextId = String(nextStepId);
    if (prevId !== nextId) {
      await new this.customerStepUpdateLogModel({
        customerId: customer._id,
        ...(customer.customerStepId !== undefined && {
          fromCustomerStepId: customer.customerStepId,
        }),
        toCustomerStepId: nextStepId,
        actorUserId,
      }).save();
      customer.customerStepId = nextStepId;
    }
    customer.$locals['__auditActorUserId'] = actorUserId;
    return customer.save();
  }

  private async resolveCustomerStepObjectId(
    stepId: string,
  ): Promise<Types.ObjectId | undefined> {
    const trimmed = stepId.trim();
    if (trimmed === '') {
      return undefined;
    }
    const exists = await this.customerStepModel.findById(trimmed).lean().exec();
    if (!exists) {
      throw new BadRequestException(`Customer step not found: ${trimmed}`);
    }
    return new Types.ObjectId(trimmed);
  }

  /**
   * Sets `assignedTo` from admin CRM (empty string clears assignee).
   */
  async assignCustomerAssignee(
    customerId: string,
    dto: AssignCustomerAssigneeDto,
    actorUserId: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    const trimmed = dto.assignedTo.trim();
    customer.assignedTo = trimmed === '' ? undefined : trimmed;
    customer.$locals['__auditActorUserId'] = actorUserId;
    return customer.save();
  }

  async addCustomerDescription(
    customerId: string,
    userId: string,
    dto: AddCustomerDescriptionDto,
  ): Promise<CustomerDescriptionDocument> {
    await this.ensureCustomerExists(customerId);
    const existing = await this.customerModel
      .findById(customerId)
      .select('description')
      .lean()
      .exec();
    const beforeDesc = (existing?.description ?? []).map((id) => String(id));
    const created = await new this.customerDescriptionModel({
      customerId: new Types.ObjectId(customerId),
      user: userId,
      date: dto.date ? new Date(dto.date) : new Date(),
      description: dto.description,
    }).save();
    await this.customerModel
      .findByIdAndUpdate(customerId, {
        $push: { description: created._id },
      })
      .exec();
    const afterDesc = [...beforeDesc, String(created._id)];
    await this.customerAuditService.recordArrayOrQueryUpdate({
      customerId,
      actorUserId: userId,
      summaryField: 'description',
      from: beforeDesc,
      to: afterDesc,
    });
    return created;
  }

  async addInterestedProject(
    customerId: string,
    userId: string,
    dto: AddInterestedProjectDto,
  ): Promise<CustomerDocument> {
    const beforeDoc = await this.customerModel
      .findById(customerId)
      .select('interestedProjects')
      .lean()
      .exec();
    const beforeProjects = beforeDoc?.interestedProjects ?? [];
    const customer = await this.customerModel
      .findByIdAndUpdate(
        customerId,
        {
          $push: {
            interestedProjects: {
              projectId: dto.projectId,
              date: dto.date ? new Date(dto.date) : new Date(),
              addedBy: userId,
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
    await this.customerAuditService.recordArrayOrQueryUpdate({
      customerId,
      actorUserId: userId,
      summaryField: 'interestedProjects',
      from: beforeProjects,
      to: customer.interestedProjects,
    });
    return customer;
  }

  async findCustomerForWhatsappLink(
    phoneOrWhatsapp: string,
    userSessionId?: string,
  ): Promise<{ customerId: string; assignedTo?: string } | null> {
    const canonical = normalizeCustomerPhone(phoneOrWhatsapp || '');
    if (canonical === '') {
      return null;
    }

    const compactDigits = canonical.replace(/\D/g, '');
    const candidates = [...new Set([canonical, compactDigits])].filter(
      (value) => value !== '',
    );
    if (candidates.length === 0) {
      return null;
    }

    const query = {
      $or: [{ phone: { $in: candidates } }, { whatsapp: { $in: candidates } }],
    };
    const docs = await this.customerModel
      .find(query)
      .select('_id assignedTo')
      .lean()
      .exec();
    if (docs.length === 0) {
      return null;
    }

    if (userSessionId && userSessionId.trim() !== '') {
      const preferred = docs.find((doc) => doc.assignedTo === userSessionId);
      if (preferred) {
        return { customerId: String(preferred._id), assignedTo: preferred.assignedTo };
      }
    }

    return { customerId: String(docs[0]._id), assignedTo: docs[0].assignedTo };
  }

  private async ensureCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel.exists({ _id: customerId }).exec();
    if (!exists) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
  }
}
