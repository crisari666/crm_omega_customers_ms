import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { META_LEAD_FORM_QUALIFICATION_QUEUE } from './constants/meta-lead-form.constants';
import { MetaLeadFormQualificationService } from './meta-lead-form-qualification.service';
import type { MetaLeadFormQualificationJobData } from './types/meta-lead-form-qualification-job.type';

@Processor(META_LEAD_FORM_QUALIFICATION_QUEUE)
export class MetaLeadFormQualificationProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaLeadFormQualificationProcessor.name);

  constructor(
    private readonly qualificationService: MetaLeadFormQualificationService,
  ) {
    super();
  }

  async process(job: Job<MetaLeadFormQualificationJobData>): Promise<void> {
    this.logger.log(
      `Processing delayed outbound jobId=${job.id ?? ''} leadgenId=${job.data.leadgenId}`,
    );
    await this.qualificationService.executeDelayedOutbound(job.data);
  }
}
