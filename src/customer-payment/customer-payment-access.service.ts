import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OFFICE_USER_LEVEL_ADMIN } from '../core/constants/office-user-level.constant';
import type { OfficeJwtPayload } from '../core/types/office-jwt-payload.type';
import { resolveOfficeUserId } from '../core/utils/resolve-office-user-id';
import { Customer, CustomerDocument } from '../customer/schemas/customer.schema';
import {
  VentorScheduleEvent,
  VentorScheduleEventDocument,
} from '../ventor-schedule/schemas/ventor-schedule-event.schema';

/**
 * Enforces who may create down payments / fees for a customer.
 */
@Injectable()
export class CustomerPaymentAccessService {
  private readonly logger = new Logger(CustomerPaymentAccessService.name);

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(VentorScheduleEvent.name)
    private readonly scheduleModel: Model<VentorScheduleEventDocument>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Admin always; physical ventors only when assignedTo or on-land for the customer.
   */
  async assertCanRecordCustomerPayment(params: {
    readonly jwtUser: OfficeJwtPayload | undefined;
    readonly customerId: string;
  }): Promise<string> {
    const actorId = resolveOfficeUserId(params.jwtUser);
    if (params.jwtUser?.level === OFFICE_USER_LEVEL_ADMIN) {
      return actorId;
    }
    const isPhysical = await this.fetchUserIsPhysical(actorId);
    if (!isPhysical) {
      throw new ForbiddenException(
        'Only CRM admin or physical ventors may record payments',
      );
    }
    if (!Types.ObjectId.isValid(params.customerId)) {
      throw new ForbiddenException('Invalid customer');
    }
    const customer = await this.customerModel
      .findById(params.customerId)
      .select({ assignedTo: 1 })
      .lean()
      .exec();
    if (customer == null) {
      throw new ForbiddenException('Customer not found');
    }
    if (
      customer.assignedTo != null &&
      String(customer.assignedTo).trim() === actorId
    ) {
      return actorId;
    }
    const onLandMatch = await this.scheduleModel
      .exists({
        customerId: new Types.ObjectId(params.customerId),
        onLandAgentUserId: actorId,
      })
      .exec();
    if (onLandMatch) {
      return actorId;
    }
    throw new ForbiddenException(
      'You must be assigned or on-land for this customer to record payments',
    );
  }

  private async fetchUserIsPhysical(userId: string): Promise<boolean> {
    const baseUrl = (
      this.configService.get<string>('officeBackInternal.baseUrl', '') ?? ''
    ).trim();
    const apiKey = (
      this.configService.get<string>('officeBackInternal.apiKey', '') ?? ''
    ).trim();
    if (baseUrl === '' || apiKey === '') {
      this.logger.warn('officeBackInternal missing; deny physical check');
      return false;
    }
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = `${normalizedBase}internal/users/${encodeURIComponent(userId)}/physical`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-Internal-Key': apiKey },
      });
      if (!response.ok) {
        this.logger.warn(`Physical lookup HTTP ${response.status} userId=${userId}`);
        return false;
      }
      const data = (await response.json()) as { physical?: boolean };
      return data.physical === true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Physical lookup failed userId=${userId}: ${message}`);
      return false;
    }
  }
}
