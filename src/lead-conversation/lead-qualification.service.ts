import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerMetadataService } from '../customer-metadata/customer-metadata.service';
import { PAYMENT_METADATA_CODES } from './constants/answer-mappings.constants';
import { LeadConversationSessionService, type LeadSessionSnapshot } from './lead-conversation-session.service';
import { LeadCustomerService } from './lead-customer.service';

/**
 * Runs when the call gets scheduled: copies answers into `customer_metadata`
 * and records the advance-leads user that owns the booked call on the session.
 */
@Injectable()
export class LeadQualificationService {
  private readonly logger = new Logger(LeadQualificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly leadCustomer: LeadCustomerService,
    private readonly metadataService: CustomerMetadataService,
    private readonly sessionService: LeadConversationSessionService,
  ) {}

  async executeQualify(session: LeadSessionSnapshot): Promise<void> {
    await this.executeSaveMetadata(session).catch((err: unknown) =>
      this.logger.warn(`Lead metadata save failed for ${String(session.customerId)}: ${String(err)}`),
    );
    await this.executeAssignVentor(session);
  }

  private async executeSaveMetadata(session: LeadSessionSnapshot): Promise<void> {
    const customerId = String(session.customerId);
    const current = await this.metadataService.getByCustomerId(customerId);
    const answers = session.answers ?? {};
    await this.metadataService.upsertByCustomerId({
      customerId,
      actorUserId: this.getActorUserId(),
      values: {
        ...current.values,
        ...(session.projectId ? { projectId: session.projectId } : {}),
        ...(answers.rangoLote ? { lotRange: answers.rangoLote } : {}),
        ...(answers.formaPago ? { paymentMethod: PAYMENT_METADATA_CODES[answers.formaPago] } : {}),
        ...(answers.horarioLlamada ? { preferredCallTime: answers.horarioLlamada } : {}),
        ...(answers.fechaLlamada ? { scheduledCallAt: answers.fechaLlamada } : {}),
      },
    });
  }

  /** The booked call slot already assigned the customer to its advance-leads user; mirror it on the session. */
  private async executeAssignVentor(session: LeadSessionSnapshot): Promise<void> {
    const customer = await this.leadCustomer.findById(session.customerId);
    const ventorId = (customer?.assignedTo ?? '').trim();
    if (ventorId) {
      await this.sessionService.setAssignedVentor(session._id, ventorId);
    }
  }

  private getActorUserId(): string {
    return this.configService.get<string>('leadConversation.actorUserId', 'lead-conversation-bot');
  }
}
