import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import {
  VentorAssignmentCandidate,
  VentorLoadBalancePickResult,
} from './types/ventor-assignment-candidate.type';

/**
 * Load-balances {@link Customer} assignment across physical ventors from omega_office_back.
 */
@Injectable()
export class CustomerVentorAssignmentService {
  private readonly logger = new Logger(CustomerVentorAssignmentService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  /**
   * Picks ventor with fewest assignments in a time window.
   * Use {@link windowHours} for rolling window, or explicit ISO bounds (WhatsApp flow: 28 local midnights).
   */
  async executePickVentorByLoadBalance(input: {
    readonly windowHours?: number;
    readonly windowStartIso?: string;
    readonly windowEndIso?: string;
  }): Promise<VentorLoadBalancePickResult | null> {
    const ventors = await this.executeFetchPhysicalVentors();
    if (ventors.length === 0) {
      this.logger.warn('No physical ventors from office_back; skip assignment pick');
      return null;
    }
    let startIso: string;
    let endIso: string;
    if (input.windowStartIso != null && input.windowEndIso != null) {
      startIso = input.windowStartIso;
      endIso = input.windowEndIso;
    } else {
      const windowHours = (input.windowHours ?? 24) > 0 ? (input.windowHours ?? 24) : 24;
      const windowEnd = new Date();
      const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);
      startIso = windowStart.toISOString();
      endIso = windowEnd.toISOString();
    }
    const countsByVentorId: Record<string, number> = {};
    for (const ventor of ventors) {
      const count = await this.customerModel.countDocuments({
        assignedTo: ventor.id,
        assignedDate: { $gte: startIso, $lte: endIso },
      });
      countsByVentorId[ventor.id] = count;
    }
    this.logger.log(
      `Ventor load balance ${startIso}..${endIso} counts=${JSON.stringify(countsByVentorId)}`,
    );
    let chosen: VentorAssignmentCandidate | null = null;
    let bestCount = Number.POSITIVE_INFINITY;
    const sortedVentors = [...ventors].sort((a, b) => a.id.localeCompare(b.id));
    for (const ventor of sortedVentors) {
      const assignmentCount = countsByVentorId[ventor.id] ?? 0;
      if (assignmentCount < bestCount) {
        bestCount = assignmentCount;
        chosen = ventor;
      }
    }
    if (chosen == null) {
      return null;
    }
    return {
      ventor: chosen,
      countsByVentorId,
      windowStartIso: startIso,
      windowEndIso: endIso,
    };
  }

  /**
   * Assigns customer to ventor when not already assigned; returns updated document or null if skipped.
   */
  async executeAssignCustomerIfUnassigned(input: {
    readonly customer: CustomerDocument;
    readonly windowHours: number;
    readonly actorUserId: string;
    readonly onAssigned?: (customer: CustomerDocument, ventor: VentorAssignmentCandidate) => Promise<void>;
  }): Promise<CustomerDocument | null> {
    const existingAssignee = (input.customer.assignedTo ?? '').trim();
    if (existingAssignee.length > 0) {
      this.logger.log(
        `Customer ${String(input.customer._id)} already assigned to ${existingAssignee}; skip`,
      );
      return null;
    }
    const pick = await this.executePickVentorByLoadBalance({
      windowHours: input.windowHours,
    });
    if (pick == null) {
      return null;
    }
    input.customer.assignedTo = pick.ventor.id;
    input.customer.assignedDate = new Date().toISOString();
    input.customer.$locals['__auditActorUserId'] = input.actorUserId;
    await input.customer.save();
    if (input.onAssigned != null) {
      await input.onAssigned(input.customer, pick.ventor);
    }
    this.logger.log(
      `Assigned customer ${String(input.customer._id)} to ventor ${pick.ventor.id} (window ${pick.windowStartIso}..${pick.windowEndIso})`,
    );
    return input.customer;
  }

  getMetaCampaignAssignmentWindowHours(): number {
    const raw = this.configService.get<number>('ventorAssignment.metaCampaignWindowHours', 24);
    return typeof raw === 'number' && raw > 0 ? raw : 24;
  }

  /** Rolling window for omega_gateway ingress (WhatsApp messages + Meta leadgen). */
  getGatewayIngressAssignmentWindowHours(): number {
    const gatewayRaw = this.configService.get<number>('ventorAssignment.gatewayWindowHours', 0);
    if (typeof gatewayRaw === 'number' && gatewayRaw > 0) {
      return gatewayRaw;
    }
    return this.getMetaCampaignAssignmentWindowHours();
  }

  async executeFindVentorById(ventorId: string): Promise<VentorAssignmentCandidate | null> {
    const trimmed = ventorId.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const ventors = await this.executeFetchPhysicalVentors();
    return ventors.find((row) => row.id === trimmed) ?? null;
  }

  getFlowCompletedAssignmentWindowDays(): number {
    const raw = this.configService.get<number>('ventorAssignment.flowCompletedWindowDays', 28);
    return typeof raw === 'number' && raw > 0 ? raw : 28;
  }

  buildFlowCompletedWindowStart(): { readonly startIso: string; readonly endIso: string } {
    const days = this.getFlowCompletedAssignmentWindowDays();
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - days);
    return { startIso: windowStart.toISOString(), endIso: windowEnd.toISOString() };
  }

  private async executeFetchPhysicalVentors(): Promise<VentorAssignmentCandidate[]> {
    const baseUrl = (this.configService.get<string>('officeBackInternal.baseUrl', '') ?? '').trim();
    const apiKey = (this.configService.get<string>('officeBackInternal.apiKey', '') ?? '').trim();
    if (baseUrl === '' || apiKey === '') {
      this.logger.warn('officeBackInternal baseUrl or apiKey missing; cannot load ventors');
      return [];
    }
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = `${normalizedBase}internal/ventors/physical-assignment-candidates`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-Internal-Key': apiKey },
      });
      if (!response.ok) {
        this.logger.warn(`Ventor fetch HTTP ${response.status}`);
        return [];
      }
      const data = (await response.json()) as { ventors?: VentorAssignmentCandidate[] };
      const rows = Array.isArray(data.ventors) ? data.ventors : [];
      return rows.filter((row) => typeof row.id === 'string' && row.id.length > 0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ventor fetch failed: ${message}`);
      return [];
    }
  }
}
