import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AddCustomerDescriptionDto } from './dto/add-customer-description.dto';
import { AddInterestedProjectDto } from './dto/add-interested-project.dto';
import { CreateCustomerAdminDto } from './dto/create-customer-admin.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import {
  CustomerDescription,
  CustomerDescriptionDocument,
} from './schemas/descriptions.schema';

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerDescription.name)
    private readonly customerDescriptionModel: Model<CustomerDescriptionDocument>,
  ) {}

  executePing(): string {
    return 'ok';
  }

  async findCustomersCreatedBy(createdBy: string): Promise<CustomerDocument[]> {
    return this.customerModel
      .find({ createdBy })
      .sort({ createdAt: -1 })
      .exec();
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
    const saved = await created.save();
    const noteText = dto.note?.trim();
    if (noteText) {
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
    }
    const updated = await this.customerModel.findById(saved._id).exec();
    return updated ?? saved;
  }

  async updateCustomer(
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
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

  async addCustomerDescription(
    customerId: string,
    userId: string,
    dto: AddCustomerDescriptionDto,
  ): Promise<CustomerDescriptionDocument> {
    await this.ensureCustomerExists(customerId);
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
    return created;
  }

  async addInterestedProject(
    customerId: string,
    userId: string,
    dto: AddInterestedProjectDto,
  ): Promise<CustomerDocument> {
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
    return customer;
  }

  private async ensureCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel.exists({ _id: customerId }).exec();
    if (!exists) {
      throw new NotFoundException(`Customer ${customerId} was not found`);
    }
  }
}
