import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { LeadTemplateRef } from '../lead-conversation/types/lead-template-ref.type';
import { LEAD_RECOVERY_SEQUENCE_KEY } from './constants/lead-assistant.constants';
import type { LeadRecoveryStepDto } from './dto/lead-recovery-step.dto';
import type { ReplaceLeadRecoverySequenceDto } from './dto/replace-lead-recovery-sequence.dto';
import {
  LeadRecoverySequence,
  LeadRecoverySequenceDocument,
} from './schemas/lead-recovery-sequence.schema';
import type { LeadRecoverySequenceView } from './types/lead-recovery-sequence-view.type';
import type { LeadRecoveryStep } from './types/lead-recovery-step.type';
import { extractTemplateVariables } from './utils/extract-template-variables.util';
import { mapTemplateRef } from './utils/map-template-ref.util';

const mapStep = (step: LeadRecoveryStep): LeadRecoveryStep => ({
  id: step.id,
  label: step.label,
  offsetHours: step.offsetHours,
  enabled: step.enabled,
  template: mapTemplateRef(step.template),
  sentCount: step.sentCount ?? 0,
  repliedCount: step.repliedCount ?? 0,
});

const findUnboundVariables = (template: LeadTemplateRef): string[] =>
  extractTemplateVariables(template.bodyText).filter(
    (variable) => !template.bindings.some((binding) => binding.variable === variable),
  );

/**
 * Singleton recovery sequence: follow-up templates sent to leads that stop answering.
 */
@Injectable()
export class LeadRecoverySequenceService {
  constructor(
    @InjectModel(LeadRecoverySequence.name)
    private readonly sequenceModel: Model<LeadRecoverySequenceDocument>,
  ) {}

  /** Returns the sequence; an empty one when nothing was configured yet. */
  async executeGet(): Promise<LeadRecoverySequenceView> {
    const row = await this.sequenceModel.findOne({ key: LEAD_RECOVERY_SEQUENCE_KEY }).lean().exec();
    return { steps: (row?.steps ?? []).map(mapStep) };
  }

  /**
   * Replaces the whole sequence. Steps without `id` get a new one; known ids keep their counters.
   * Rejects duplicate offsets and template variables without a binding.
   */
  async executeReplace(dto: ReplaceLeadRecoverySequenceDto): Promise<LeadRecoverySequenceView> {
    this.assertNoDuplicateOffsets(dto.steps);
    dto.steps.forEach((step) => this.assertAllVariablesBound(step));
    const current = await this.executeGet();
    const steps = dto.steps.map((step) => this.buildStep(step, current.steps));
    const row = await this.sequenceModel
      .findOneAndUpdate({ key: LEAD_RECOVERY_SEQUENCE_KEY }, { $set: { steps } }, { upsert: true, new: true })
      .lean()
      .exec();
    return { steps: (row?.steps ?? []).map(mapStep) };
  }

  /** Finds one step of the sequence by id. */
  async findStep(id: string): Promise<LeadRecoveryStep | null> {
    const sequence = await this.executeGet();
    return sequence.steps.find((step) => step.id === id) ?? null;
  }

  async executeIncrementSent(id: string): Promise<void> {
    await this.incrementCounter(id, 'sentCount');
  }

  async executeIncrementReplied(id: string): Promise<void> {
    await this.incrementCounter(id, 'repliedCount');
  }

  private async incrementCounter(id: string, counter: 'sentCount' | 'repliedCount'): Promise<void> {
    await this.sequenceModel
      .updateOne(
        { key: LEAD_RECOVERY_SEQUENCE_KEY, 'steps.id': id },
        { $inc: { [`steps.$.${counter}`]: 1 } },
      )
      .exec();
  }

  private buildStep(step: LeadRecoveryStepDto, currentSteps: readonly LeadRecoveryStep[]): LeadRecoveryStep {
    const id = step.id != null && step.id.length > 0 ? step.id : randomUUID();
    const previous = currentSteps.find((candidate) => candidate.id === id);
    return {
      id,
      label: step.label.trim(),
      offsetHours: step.offsetHours,
      enabled: step.enabled,
      template: mapTemplateRef(step.template),
      sentCount: previous?.sentCount ?? 0,
      repliedCount: previous?.repliedCount ?? 0,
    };
  }

  private assertNoDuplicateOffsets(steps: readonly LeadRecoveryStepDto[]): void {
    const seen = new Set<number>();
    for (const step of steps) {
      if (seen.has(step.offsetHours)) {
        throw new BadRequestException(
          `Hay pasos con el mismo tiempo de espera (${step.offsetHours} h). Cada paso debe tener un tiempo distinto.`,
        );
      }
      seen.add(step.offsetHours);
    }
  }

  private assertAllVariablesBound(step: LeadRecoveryStepDto): void {
    const unbound = findUnboundVariables(step.template);
    if (unbound.length > 0) {
      throw new BadRequestException(
        `La plantilla "${step.template.name}" del paso "${step.label}" tiene variables sin asignar: ${unbound.join(', ')}.`,
      );
    }
  }
}
