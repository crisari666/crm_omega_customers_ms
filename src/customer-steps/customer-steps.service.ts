import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCustomerStepDto } from './dto/create-customer-step.dto';
import { UpdateCustomerStepDto } from './dto/update-customer-step.dto';
import {
  CustomerStep,
  CustomerStepDocument,
} from './schemas/customer-step.schema';
import { CustomerStepResponse } from './types/customer-step-response.type';

/**
 * Handles CRM customer step catalog management.
 */
@Injectable()
export class CustomerStepsService {
  constructor(
    @InjectModel(CustomerStep.name)
    private readonly customerStepModel: Model<CustomerStepDocument>,
  ) {}

  async listCustomerSteps(): Promise<CustomerStepResponse[]> {
    const rows = await this.customerStepModel
      .find()
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec();
    return rows.map((row) => this.mapToResponse(row));
  }

  async createCustomerStep(
    dto: CreateCustomerStepDto,
    actorUserId: string,
  ): Promise<CustomerStepResponse> {
    const created = await new this.customerStepModel({
      name: dto.name.trim(),
      ...(dto.description !== undefined && { description: dto.description.trim() }),
      order: dto.order ?? 0,
      ...(dto.color !== undefined && { color: dto.color.trim() }),
      isActive: dto.isActive ?? true,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    }).save();
    return this.mapToResponse(created.toObject());
  }

  async updateCustomerStep(
    stepId: string,
    dto: UpdateCustomerStepDto,
    actorUserId: string,
  ): Promise<CustomerStepResponse> {
    const step = await this.customerStepModel.findById(stepId).exec();
    if (step === null) {
      throw new NotFoundException(`Customer step ${stepId} was not found`);
    }
    if (dto.name !== undefined) {
      step.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      const trimmedDescription = dto.description.trim();
      step.description =
        trimmedDescription === '' ? undefined : trimmedDescription;
    }
    if (dto.order !== undefined) {
      step.order = dto.order;
    }
    if (dto.color !== undefined) {
      const trimmedColor = dto.color.trim();
      step.color = trimmedColor === '' ? undefined : trimmedColor;
    }
    if (dto.isActive !== undefined) {
      step.isActive = dto.isActive;
    }
    step.updatedBy = actorUserId;
    const saved = await step.save();
    return this.mapToResponse(saved.toObject());
  }

  private mapToResponse(doc: {
    _id: unknown;
    name: string;
    description?: string;
    order: number;
    color?: string;
    isActive: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  }): CustomerStepResponse {
    const createdAt = doc.createdAt ?? new Date();
    const updatedAt = doc.updatedAt ?? createdAt;
    return {
      id: String(doc._id),
      name: doc.name,
      ...(doc.description !== undefined && { description: doc.description }),
      order: doc.order,
      ...(doc.color !== undefined && { color: doc.color }),
      isActive: doc.isActive,
      createdAt:
        createdAt instanceof Date
          ? createdAt.toISOString()
          : new Date(createdAt).toISOString(),
      updatedAt:
        updatedAt instanceof Date
          ? updatedAt.toISOString()
          : new Date(updatedAt).toISOString(),
    };
  }
}
