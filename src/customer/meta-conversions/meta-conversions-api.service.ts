import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../schemas/customer.schema';
import {
  MetaLeadCampaign,
  MetaLeadCampaignDocument,
} from '../schemas/meta-lead-campaign.schema';
import { MetaCapiLeadEventPayload, MetaCapiUserData } from './types/meta-capi-lead-event.type';
import {
  buildMetaFbcFromFbclid,
  hashMetaCapiValue,
} from './utils/hash-meta-capi-value.util';

/**
 * Sends CRM Lead stage events to Meta Conversions API (dataset /events).
 */
@Injectable()
export class MetaConversionsApiService {
  private readonly logger = new Logger(MetaConversionsApiService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(MetaLeadCampaign.name)
    private readonly metaLeadCampaignModel: Model<MetaLeadCampaignDocument>,
  ) {}

  /**
   * Fire-and-forget Lead event when customer enters the configured Lead step.
   * Never throws to callers; logs failures.
   */
  executeSendLeadEventForCustomer(customerId: string): void {
    void this.executeSendLeadEventForCustomerAsync(customerId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Meta CAPI Lead event failed customerId=${customerId}: ${message}`);
    });
  }

  private async executeSendLeadEventForCustomerAsync(customerId: string): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug('Meta CAPI skipped: disabled or missing access token');
      return;
    }
    const customer = await this.customerModel.findById(customerId).exec();
    if (customer == null) {
      this.logger.warn(`Meta CAPI: customer ${customerId} not found`);
      return;
    }
    const leadgenId = await this.resolveLeadgenId(customer);
    const userData = this.buildUserData(customer, leadgenId);
    if (Object.keys(userData).length === 0) {
      this.logger.warn(
        `Meta CAPI: no matchable user_data for customerId=${customerId}; skip send`,
      );
      return;
    }
    const leadEventSource = this.configService.get<string>(
      'metaCapi.leadEventSource',
      'Omega CRM',
    );
    const payload: MetaCapiLeadEventPayload = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          custom_data: {
            event_source: 'crm',
            lead_event_source: leadEventSource,
          },
          user_data: userData,
        },
      ],
    };
    await this.postEvents(payload);
    this.logger.log(`Meta CAPI Lead event sent customerId=${customerId}`);
  }

  isLeadStepId(stepId: string): boolean {
    const configured = this.configService
      .get<string>('metaCapi.leadStepId', '69e64b5c04041548fb4dcadf')
      .trim();
    return configured.length > 0 && stepId === configured;
  }

  private isEnabled(): boolean {
    const enabledFlag = this.configService.get<boolean>('metaCapi.enabled', true);
    if (!enabledFlag) {
      return false;
    }
    const token = this.configService.get<string>('metaCapi.accessToken', '').trim();
    return token.length > 0;
  }

  private async resolveLeadgenId(customer: CustomerDocument): Promise<string> {
    const denormalized =
      typeof customer.metaLeadgenId === 'string' ? customer.metaLeadgenId.trim() : '';
    if (denormalized.length > 0) {
      return denormalized;
    }
    const campaign = await this.metaLeadCampaignModel
      .findOne({ customerId: customer._id as Types.ObjectId })
      .sort({ createdAt: -1 })
      .select('leadgenId')
      .lean()
      .exec();
    return typeof campaign?.leadgenId === 'string' ? campaign.leadgenId.trim() : '';
  }

  private buildUserData(customer: CustomerDocument, leadgenId: string): MetaCapiUserData {
    const userData: {
      lead_id?: number;
      em?: string[];
      ph?: string[];
      fn?: string[];
      ln?: string[];
      ctwa_clid?: string;
      fbc?: string;
    } = {};
    const leadIdNumber = this.parseLeadId(leadgenId);
    if (leadIdNumber !== undefined) {
      userData.lead_id = leadIdNumber;
    }
    const emailHash = hashMetaCapiValue(customer.email ?? '', 'email');
    if (emailHash.length > 0) {
      userData.em = [emailHash];
    }
    const phoneHash = hashMetaCapiValue(customer.phone ?? '', 'phone');
    if (phoneHash.length > 0) {
      userData.ph = [phoneHash];
    }
    const firstNameHash = hashMetaCapiValue(customer.name ?? '', 'name');
    if (firstNameHash.length > 0) {
      userData.fn = [firstNameHash];
    }
    const lastNameHash = hashMetaCapiValue(customer.lastName ?? '', 'name');
    if (lastNameHash.length > 0) {
      userData.ln = [lastNameHash];
    }
    const ctwaClid =
      typeof customer.metaCtwaClid === 'string' ? customer.metaCtwaClid.trim() : '';
    if (ctwaClid.length > 0) {
      userData.ctwa_clid = ctwaClid;
    }
    const fbclid =
      typeof customer.metaFbclid === 'string' ? customer.metaFbclid.trim() : '';
    const fbc = buildMetaFbcFromFbclid(fbclid);
    if (fbc.length > 0) {
      userData.fbc = fbc;
    }
    return userData;
  }

  private parseLeadId(leadgenId: string): number | undefined {
    if (!/^\d{15,17}$/.test(leadgenId)) {
      return undefined;
    }
    const parsed = Number(leadgenId);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  private async postEvents(payload: MetaCapiLeadEventPayload): Promise<void> {
    const accessToken = this.configService.get<string>('metaCapi.accessToken', '').trim();
    const datasetId = this.configService
      .get<string>('metaCapi.datasetId', '7399429630115923')
      .trim();
    const apiVersion = this.configService.get<string>('metaCapi.apiVersion', 'v26.0').trim();
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${datasetId}/events`);
    const endpoint = url.toString();
    url.searchParams.set('access_token', accessToken);
    const body = JSON.stringify(payload);
    this.logger.log(`Meta CAPI request POST ${endpoint} body=${body}`);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Meta CAPI HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
    }
    this.logger.log(
      `Meta CAPI response ok status=${response.status} body=${bodyText.slice(0, 500)}`,
    );
  }
}
