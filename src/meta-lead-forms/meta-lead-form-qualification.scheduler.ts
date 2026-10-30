import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  META_LEAD_FORM_QUALIFICATION_JOB,
  META_LEAD_FORM_QUALIFICATION_QUEUE,
  buildMetaLeadFormQualificationJobId,
} from './constants/meta-lead-form.constants';
import { MetaLeadFormsService } from './meta-lead-forms.service';
import type { MetaLeadFormQualificationJobData } from './types/meta-lead-form-qualification-job.type';

/**
 * Schedules / cancels delayed qualification outbound after Lead Ads ingest.
 */
@Injectable()
export class MetaLeadFormQualificationScheduler {
  private readonly logger = new Logger(MetaLeadFormQualificationScheduler.name);

  constructor(
    @InjectQueue(META_LEAD_FORM_QUALIFICATION_QUEUE)
    private readonly qualificationQueue: Queue<MetaLeadFormQualificationJobData>,
    private readonly metaLeadFormsService: MetaLeadFormsService,
  ) {}

  async executeSchedule(input: MetaLeadFormQualificationJobData): Promise<void> {
    const jobId = buildMetaLeadFormQualificationJobId(input.phone);
    await this.executeCancelByPhone(input.phone);
    const delayMs = await this.metaLeadFormsService.executeGetOutboundDelayMs();
    await this.qualificationQueue.add(META_LEAD_FORM_QUALIFICATION_JOB, input, {
      jobId,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log(
      `Scheduled lead-form qualification jobId=${jobId} delayMs=${delayMs} leadgenId=${input.leadgenId}`,
    );
  }

  async executeCancelByPhone(phone: string): Promise<void> {
    const jobId = buildMetaLeadFormQualificationJobId(phone);
    try {
      await this.qualificationQueue.remove(jobId);
      this.logger.debug(`Cancelled lead-form qualification jobId=${jobId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Cancel lead-form qualification jobId=${jobId}: ${message}`);
    }
  }

  async executeCancelByWaId(waId: string): Promise<void> {
    await this.executeCancelByPhone(waId);
  }
}
