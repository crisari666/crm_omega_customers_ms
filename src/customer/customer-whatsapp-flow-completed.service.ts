import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument, DocumentType } from './schemas/customer.schema';
import { normalizeCustomerPhone } from './utils/normalize-customer-phone.util';
import { formatVentorAssignmentMessageForCustomer } from './utils/format-ventor-assignment-message.util';
import { CustomerPotentialCustomersOutboundService } from './customer-potential-customers-outbound.service';

type VentorCandidateRow = {
  readonly id: string;
  readonly name: string;
  readonly lastName: string;
  readonly phone: string;
  readonly phoneJob: string;
};

type FlowCompletedPayload = {
  readonly waId: string;
  readonly phoneNumberId: string;
  readonly flowResponse: unknown;
  readonly rawMessageId?: string;
};

/**
 * Handles WhatsApp Flow completion: patch {@link Customer}, load-balancing ventor assignment, outbound notice.
 */
@Injectable()
export class CustomerWhatsappFlowCompletedService {
  private readonly logger: Logger = new Logger(CustomerWhatsappFlowCompletedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly potentialCustomersOutbound: CustomerPotentialCustomersOutboundService,
  ) {}

  async executeProcessFlowCompleted(payload: FlowCompletedPayload): Promise<void> {
    const waId: string = normalizeCustomerPhone(payload.waId);
    if (waId === '') {
      return;
    }
    const customer = await this.findCustomerByWaCandidates(waId);
    if (!customer) {
      this.logger.warn(`Flow completed: no customer for waId=${waId}`);
      return;
    }
    const flowRoot: Record<string, unknown> = this.parseFlowResponse(payload.flowResponse);
    this.applyFlowFieldsToCustomer(customer, flowRoot);
    customer.whatsappPotentialCustomerStatus = 'completed_flow';
    const ventors: VentorCandidateRow[] = await this.executeFetchPhysicalVentors();
    if (ventors.length === 0) {
      this.logger.warn('Flow completed: no physical ventors from office_back; skip assignment');
      await customer.save();
      return;
    }
    const timeZone: string = this.configService.get<string>('ventorAssignment.timeZone', 'America/Bogota');
    const windowStart: Date = this.buildWindowStartLocalMidnightMinus28Days(timeZone);
    const windowEnd: Date = new Date();
    const startIso: string = windowStart.toISOString();
    const endIso: string = windowEnd.toISOString();
    const countsByVentorId: Record<string, number> = {};
    for (const v of ventors) {
      const n: number = await this.customerModel.countDocuments({
        assignedTo: v.id,
        assignedDate: { $gte: startIso, $lte: endIso },
      });
      countsByVentorId[v.id] = n;
    }
    console.log(
      JSON.stringify({
        ventorAssignmentFilter: { windowStart: startIso, windowEnd: endIso, timeZone, countsByVentorId },
      }),
    );
    let chosen: VentorCandidateRow | null = null;
    let bestCount = Number.POSITIVE_INFINITY;
    const sortedVentors: VentorCandidateRow[] = [...ventors].sort((a, b) => a.id.localeCompare(b.id));
    for (const v of sortedVentors) {
      const c: number = countsByVentorId[v.id] ?? 0;
      if (c < bestCount) {
        bestCount = c;
        chosen = v;
      }
    }
    if (chosen == null) {
      await customer.save();
      return;
    }
    customer.assignedTo = chosen.id;
    customer.assignedDate = new Date().toISOString();
    customer.whatsappPotentialCustomerStatus = 'ready_for_llm';
    customer.$locals['__auditActorUserId'] = chosen.id;
    await customer.save();
    const displayName: string = `${chosen.name} ${chosen.lastName}`.trim();
    const phone: string =
      chosen.phone.trim().length > 0 ? chosen.phone.trim() : chosen.phoneJob.trim();
    const body: string = formatVentorAssignmentMessageForCustomer({
      userName: displayName.length > 0 ? displayName : 'tu asesor',
      userPhone: phone.length > 0 ? phone : '-',
    });
    await this.potentialCustomersOutbound.executeEmitPotentialCustomersEvent({
      type: 'potential_customers',
      payload: {
        action: 'send.potential_customer_text',
        waId,
        phoneNumberId: payload.phoneNumberId,
        customerId: String(customer._id),
        body,
      },
    });
  }

  private buildWindowStartLocalMidnightMinus28Days(_timeZone: string): Date {
    const now: Date = new Date();
    const start: Date = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 28);
    return start;
  }

  private parseFlowResponse(raw: unknown): Record<string, unknown> {
    if (raw == null) {
      return {};
    }
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw) as unknown;
        return typeof parsed === 'object' && parsed != null ? (parsed as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
    if (typeof raw === 'object') {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  private applyFlowFieldsToCustomer(customer: CustomerDocument, flow: Record<string, unknown>): void {
    const fullName: string | undefined = this.pickFlowString(
      flow,
      'full_name',
      'fullName',
      'nombre_completo',
      'name',
    );
    if (fullName != null && fullName.length > 0) {
      const split = this.splitProfileName(fullName);
      customer.name = split.name;
      customer.lastName = split.lastName;
    }
    const email: string | undefined = this.pickFlowString(flow, 'email', 'correo', 'mail');
    if (email != null) {
      customer.email = email;
    }
    const doc: string | undefined = this.pickFlowString(flow, 'document', 'documento', 'cedula', 'cc');
    if (doc != null) {
      customer.document = doc;
    }
    const docTypeRaw: string | undefined = this.pickFlowString(flow, 'document_type', 'documentType', 'tipo_documento');
    if (docTypeRaw != null) {
      const lower: string = docTypeRaw.toLowerCase();
      if (lower.includes('pass')) {
        customer.documentType = DocumentType.Passport;
      } else if (lower.includes('cc') || lower.includes('cédula') || lower.includes('cedula')) {
        customer.documentType = DocumentType.Cc;
      }
    }
  }

  private pickStringFromUnknown(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }

  private pickFlowString(flow: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const direct = this.pickStringFromUnknown(flow[key]);
      if (direct != null) {
        return direct;
      }
      const foundKey: string | undefined = Object.keys(flow).find((k) => k.toLowerCase() === key.toLowerCase());
      if (foundKey != null) {
        const v = this.pickStringFromUnknown(flow[foundKey]);
        if (v != null) {
          return v;
        }
      }
    }
    return undefined;
  }

  private splitProfileName(full: string): { name: string; lastName: string } {
    const trimmed: string = full.trim();
    if (trimmed === '') {
      return { name: 'Contacto', lastName: '' };
    }
    const parts: string[] = trimmed.split(/\s+/u);
    if (parts.length === 1) {
      return { name: parts[0], lastName: '' };
    }
    return { name: parts[0], lastName: parts.slice(1).join(' ') };
  }

  private async findCustomerByWaCandidates(normalizedWaId: string): Promise<CustomerDocument | null> {
    const digits: string = normalizedWaId.replace(/\D/g, '');
    const candidates: string[] = [normalizedWaId, digits].filter((v, i, a) => v !== '' && a.indexOf(v) === i);
    if (candidates.length === 0) {
      return null;
    }
    return this.customerModel
      .findOne({
        $or: [{ phone: { $in: candidates } }, { whatsapp: { $in: candidates } }],
      })
      .exec();
  }

  private async executeFetchPhysicalVentors(): Promise<VentorCandidateRow[]> {
    const baseUrl: string = (this.configService.get<string>('officeBackInternal.baseUrl', '') ?? '')
    const apiKey: string = this.configService.get<string>('officeBackInternal.apiKey', '') ?? '';
    console.log(JSON.stringify({ baseUrl, apiKey }, null, 2));
    if (baseUrl === '' || apiKey === '') {
      this.logger.warn('officeBackInternal baseUrl or apiKey missing; cannot load ventors');
      return [];
    }
    const url: string = `${baseUrl}internal/ventors/physical-assignment-candidates`;
    console.log(JSON.stringify({ url }, null, 2));
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-Internal-Key': apiKey },
      });
      if (!response.ok) {
        this.logger.warn(`Ventor fetch HTTP ${response.status}`);
        return [];
      }
      const data = (await response.json()) as { ventors?: VentorCandidateRow[] };
      const rows = Array.isArray(data.ventors) ? data.ventors : [];
      return rows.filter((r) => typeof r.id === 'string' && r.id.length > 0);
    } catch (err: unknown) {
      const message: string = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ventor fetch failed: ${message}`);
      return [];
    }
  }
}
