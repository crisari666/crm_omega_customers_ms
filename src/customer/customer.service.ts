import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AddCustomerDescriptionDto } from './dto/add-customer-description.dto';
import { AddInterestedProjectDto } from './dto/add-interested-project.dto';
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
      description: dto.description ?? [],
      assignedTo: dto.assignedTo,
      createdBy,
    });
    return created.save();
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
    if (dto.description !== undefined) {
      customer.description = dto.description;
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
    const created = new this.customerDescriptionModel({
      customerId: new Types.ObjectId(customerId),
      user: userId,
      date: dto.date ? new Date(dto.date) : new Date(),
      description: dto.description,
    });
    return created.save();
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
