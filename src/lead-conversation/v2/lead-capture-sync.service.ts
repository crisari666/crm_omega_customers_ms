import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerMetadataService } from '../../customer-metadata/customer-metadata.service';
import type { LeadProfile } from '../types/lead-profile.type';
import {
  buildCaptureKnown,
  inferUrgencyFromTimeToBuy,
  listMissingCaptureFields,
  mapMotivationToBuyMotive,
  mapProfilePaymentToCapture,
  resolveNextCaptureField,
  type LeadCaptureFieldKey,
  type LeadCaptureKnown,
} from './utils/lead-capture-fields.util';

/**
 * Incremental Stage-3 capture upserts for the V2 WhatsApp agent.
 */
@Injectable()
export class LeadCaptureSyncService {
  private readonly logger = new Logger(LeadCaptureSyncService.name);

  constructor(
    private readonly metadataService: CustomerMetadataService,
    private readonly configService: ConfigService,
  ) {}

  async executeGetCaptureKnown(args: {
    readonly customerId: string;
    readonly profile: LeadProfile;
    readonly projectId?: string;
  }): Promise<{
    readonly known: LeadCaptureKnown;
    readonly missingCaptureFields: LeadCaptureFieldKey[];
    readonly nextCaptureField?: LeadCaptureFieldKey;
    readonly values: Record<string, string>;
  }> {
    const response = await this.metadataService.getByCustomerId(args.customerId);
    const known = buildCaptureKnown({
      metadataValues: response.values,
      profile: args.profile,
      projectId: args.projectId,
    });
    const missingCaptureFields = listMissingCaptureFields(known);
    const nextCaptureField = resolveNextCaptureField(known);
    return {
      known,
      missingCaptureFields,
      ...(nextCaptureField !== undefined ? { nextCaptureField } : {}),
      values: response.values,
    };
  }

  /** Merges a partial capture patch into customer_metadata (best effort). */
  async executeUpsertPatch(args: {
    readonly customerId: string;
    readonly patch: Readonly<Record<string, string>>;
  }): Promise<void> {
    const keys = Object.keys(args.patch);
    if (keys.length === 0) return;
    try {
      const current = await this.metadataService.getByCustomerId(args.customerId);
      await this.metadataService.upsertByCustomerId({
        customerId: args.customerId,
        actorUserId: this.getActorUserId(),
        values: { ...current.values, ...args.patch },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Capture upsert failed for ${args.customerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Builds metadata keys from Instant Form parse + profile facts. */
  buildPatchFromProfileAndForm(args: {
    readonly profile: LeadProfile;
    readonly projectId?: string;
    readonly form?: {
      readonly city?: string;
      readonly economicCapacity?: string;
    };
  }): Record<string, string> {
    const { profile, projectId, form } = args;
    const timeToBuy = profile.timeline;
    const urgency =
      inferUrgencyFromTimeToBuy(timeToBuy) ?? undefined;
    const buyMotive = mapMotivationToBuyMotive(profile.motivation);
    const paymentMethod = mapProfilePaymentToCapture(profile.paymentMethod);
    return {
      ...(projectId ? { projectId } : {}),
      ...(form?.city ? { city: form.city } : {}),
      ...(form?.economicCapacity ? { economicCapacity: form.economicCapacity } : {}),
      ...(buyMotive ? { buyMotive } : {}),
      ...(timeToBuy ? { timeToBuy } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(urgency ? { urgencyLevel: urgency } : {}),
      ...(profile.motivation ? { motivation: profile.motivation } : {}),
      ...(profile.timeline ? { purchaseTimeline: profile.timeline } : {}),
      ...(profile.budget ? { budget: profile.budget } : {}),
    };
  }

  private getActorUserId(): string {
    return this.configService.get<string>('leadConversation.actorUserId', 'lead-conversation-bot');
  }
}
