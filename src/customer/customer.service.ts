import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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
} from './types/customer-admin-list-item.type';
import type { CustomerAdminDetail } from './types/customer-admin-detail.type';
import { LeanCustomerListRow } from './types/lean-customer-list-row.type';
import { Customer, CustomerDocument } from './schemas/customer.schema';
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

@Injectable()
export class CustomerService {
  constructor(
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

  async findCustomersCreatedBy(createdBy: string): Promise<CustomerDocument[]> {
    return this.customerModel
      .find({ createdBy, assignedTo: createdBy })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Admin list with filters; returns only fields needed for CRM table display.
   */
  async listCustomersAdmin(
    query: ListCustomersAdminQueryDto,
  ): Promise<CustomerAdminListResponse> {
    const filter = this.buildAdminListFilter(query);
    const limit = query.limit ?? 50;
    const skip = query.skip ?? 0;

    const [raw, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .select({
          name: 1,
          lastName: 1,
          phone: 1,
          email: 1,
          assignedTo: 1,
          enabled: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);

    const items: CustomerAdminListItem[] = (raw as LeanCustomerListRow[]).map(
      (doc) => ({
        id: String(doc._id),
        name: doc.name,
        lastName: doc.lastName,
        phone: doc.phone,
        email: doc.email,
        assignedTo: doc.assignedTo,
        enabled: doc.enabled !== false,
        createdAt:
          doc.createdAt instanceof Date
            ? doc.createdAt.toISOString()
            : new Date(doc.createdAt as string).toISOString(),
      }),
    );

    return { items, total };
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
      customer.phone = dto.phone;
    }
    if (dto.whatsapp !== undefined) {
      customer.whatsapp = dto.whatsapp;
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
    }
    if (dto.enabled !== undefined) {
      customer.enabled = dto.enabled;
    }
    await customer.save();
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
    const created = new this.customerModel({
      name: dto.name,
      lastName: dto.lastName,
      phone: dto.phone,
      whatsapp: dto.whatsapp,
      email: dto.email,
      documentType: dto.documentType,
      document: dto.document,
      interestedProjects,
      assignedTo: dto.assignedTo,
      createdBy,
    });
    created.$locals['__auditActorUserId'] = createdBy;
    return created.save();
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
    const created = new this.customerModel({
      phone: dto.phone,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.user !== undefined && dto.user !== '' && { assignedTo: dto.user }),
      interestedProjects,
      createdBy,
    });
    created.$locals['__auditActorUserId'] = createdBy;
    const saved = await created.save();
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
      customer.phone = dto.phone;
    }
    if (dto.whatsapp !== undefined) {
      customer.whatsapp = dto.whatsapp;
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
    }
    return customer.save();
  }

  /**
   * Assigns pipeline step only; appends `CustomerStepUpdateLog` when the step changes.
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

  private async ensureCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel.exists({ _id: customerId }).exec();
    if (!exists) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
  }
}
