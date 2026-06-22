import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument, DocumentType } from './schemas/customer.schema';
import { normalizeCustomerPhone } from './utils/normalize-customer-phone.util';
import { formatVentorAssignmentMessageForCustomer } from './utils/format-ventor-assignment-message.util';
import { CustomerPotentialCustomersOutboundService } from './customer-potential-customers-outbound.service';
import { CustomerVentorAssignmentService } from './customer-ventor-assignment.service';
import { VentorAssignmentCandidate } from './types/ventor-assignment-candidate.type';

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
  private readonly logger = new Logger(CustomerWhatsappFlowCompletedService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly potentialCustomersOutbound: CustomerPotentialCustomersOutboundService,
    private readonly ventorAssignment: CustomerVentorAssignmentService,
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
    const flowWindow = this.ventorAssignment.buildFlowCompletedWindowStart();
    const pick = await this.ventorAssignment.executePickVentorByLoadBalance({
      windowStartIso: flowWindow.startIso,
      windowEndIso: flowWindow.endIso,
    });
    if (pick == null) {
      this.logger.warn('Flow completed: no ventor pick; skip assignment');
      await customer.save();
      return;
    }
    const existingAssignee = (customer.assignedTo ?? '').trim();
    if (existingAssignee.length > 0) {
      const ventor =
        (await this.ventorAssignment.executeFindVentorById(existingAssignee)) ?? pick.ventor;
      customer.whatsappPotentialCustomerStatus = 'ready_for_llm';
      customer.$locals['__auditActorUserId'] = existingAssignee;
      await customer.save();
      await this.executeEmitAssignmentWhatsApp(payload, customer, ventor, waId);
      return;
    }
    customer.assignedTo = pick.ventor.id;
    customer.assignedDate = new Date().toISOString();
    customer.whatsappPotentialCustomerStatus = 'ready_for_llm';
    customer.$locals['__auditActorUserId'] = pick.ventor.id;
    await customer.save();
    await this.executeEmitAssignmentWhatsApp(payload, customer, pick.ventor, waId);
  }

  private async executeEmitAssignmentWhatsApp(
    payload: FlowCompletedPayload,
    customer: CustomerDocument,
    ventor: VentorAssignmentCandidate,
    waId: string,
  ): Promise<void> {
    const displayName: string = `${ventor.name} ${ventor.lastName}`.trim();
    const phone: string =
      ventor.phone.trim().length > 0 ? ventor.phone.trim() : ventor.phoneJob.trim();
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
      } else if (lower.includes('extranjera') || lower.includes('extranjero')) {
        customer.documentType = DocumentType.ForeignCc;
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
}
