import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LeadScoringService } from './lead-scoring.service';
import {
  LeadConversationSession,
  LeadConversationSessionDocument,
} from './schemas/lead-conversation-session.schema';
import { LeadConversationStep } from './types/lead-conversation-step.enum';
import type { OutboundMessagePlan } from './types/outbound-message-plan.type';
import type { StepTransition } from './types/step-transition.type';
import { extractFirstName } from './utils/extract-first-name.util';

export type LeadSessionSnapshot = LeadConversationSession & { readonly _id: Types.ObjectId };

const QUESTION_STEPS: readonly LeadConversationStep[] = [
  LeadConversationStep.AskProject,
  LeadConversationStep.AskLotRange,
  LeadConversationStep.AskPayment,
  LeadConversationStep.AskSchedule,
  LeadConversationStep.AskCallSlot,
];

/** Persistence of {@link LeadConversationSession} with optimistic locking on `version`. */
@Injectable()
export class LeadConversationSessionService {
  constructor(
    @InjectModel(LeadConversationSession.name)
    private readonly sessionModel: Model<LeadConversationSessionDocument>,
    private readonly scoring: LeadScoringService,
  ) {}

  async findOrCreate(input: {
    readonly customerId: Types.ObjectId;
    readonly waId: string;
    readonly phoneNumberId: string;
    readonly profileName: string;
  }): Promise<LeadSessionSnapshot> {
    return this.sessionModel
      .findOneAndUpdate(
        { waId: input.waId, phoneNumberId: input.phoneNumberId },
        {
          $setOnInsert: {
            customerId: input.customerId,
            waId: input.waId,
            phoneNumberId: input.phoneNumberId,
            profileName: input.profileName,
            firstName: extractFirstName(input.profileName),
            step: LeadConversationStep.Initial,
            status: 'active',
          },
        },
        { upsert: true, new: true, lean: true },
      )
      .exec() as Promise<LeadSessionSnapshot>;
  }

  async findById(sessionId: string): Promise<LeadSessionSnapshot | null> {
    return this.sessionModel.findById(sessionId).lean().exec() as Promise<LeadSessionSnapshot | null>;
  }

  async findLatestByCustomerId(customerId: string): Promise<LeadSessionSnapshot | null> {
    return this.sessionModel
      .findOne({ customerId: new Types.ObjectId(customerId) })
      .sort({ updatedAt: -1 })
      .lean()
      .exec() as Promise<LeadSessionSnapshot | null>;
  }

  /** Applies a step transition; returns null when another worker updated the session first. */
  async applyTransition(
    session: LeadSessionSnapshot,
    transition: StepTransition,
    inboundAt: Date,
  ): Promise<LeadSessionSnapshot | null> {
    const now = new Date();
    const scoreState = transition.scoreEvent
      ? this.scoring.applyScoreEvent(session, transition.scoreEvent, now)
      : { score: session.score, priority: session.priority, scoreHistory: session.scoreHistory };
    const question = this.extractQuestion(transition);
    const $set: Record<string, unknown> = {
      step: transition.nextStep,
      answers: { ...(session.answers ?? {}), ...(transition.answersPatch ?? {}) },
      score: scoreState.score,
      priority: scoreState.priority,
      scoreHistory: scoreState.scoreHistory,
      retryCount: transition.isRetry ? session.retryCount + 1 : 0,
      lastInboundAt: inboundAt,
      ...(transition.sessionPatch ?? {}),
      ...(transition.status ? { status: transition.status } : {}),
      ...(transition.status === 'scheduled' ? { scheduledAt: now } : {}),
      ...(question
        ? { pendingOptions: question.options ?? [], lastQuestion: [{ ...question, delayMs: undefined }], lastQuestionAt: now }
        : {}),
      ...(!transition.expectsReply && transition.outbound.length > 0 ? { pendingOptions: [] } : {}),
    };
    return this.sessionModel
      .findOneAndUpdate({ _id: session._id, version: session.version }, { $set, $inc: { version: 1 } }, { new: true, lean: true })
      .exec() as Promise<LeadSessionSnapshot | null>;
  }

  /**
   * Moves a silent session to `reminder_sent` when the question asked at `questionAt` is still unanswered.
   * Returns null when the customer replied meanwhile or the reminder was already sent.
   */
  async markReminderSent(
    sessionId: string,
    questionAt: Date,
    reminder: readonly OutboundMessagePlan[],
  ): Promise<LeadSessionSnapshot | null> {
    const session = await this.findById(sessionId);
    if (!session || !this.isReminderDue(session, questionAt)) return null;
    const now = new Date();
    return this.sessionModel
      .findOneAndUpdate(
        { _id: session._id, version: session.version },
        {
          $set: {
            step: LeadConversationStep.ReminderSent,
            stepBeforeReminder: session.step,
            pendingOptions: reminder[reminder.length - 1]?.options ?? [],
            lastQuestion: reminder,
            lastQuestionAt: now,
            reminderSentAt: now,
            retryCount: 0,
          },
          $inc: { version: 1 },
        },
        { new: true, lean: true },
      )
      .exec() as Promise<LeadSessionSnapshot | null>;
  }

  async setAssignedVentor(sessionId: Types.ObjectId, ventorId: string): Promise<void> {
    await this.sessionModel.updateOne({ _id: sessionId }, { $set: { assignedVentorId: ventorId } }).exec();
  }

  /** Syncs booked call answers after an admin reschedule. */
  async patchScheduledCallAnswers(
    sessionId: Types.ObjectId,
    input: { readonly fechaLlamada: string; readonly horarioLlamada: string },
  ): Promise<void> {
    await this.sessionModel
      .updateOne(
        { _id: sessionId },
        {
          $set: {
            'answers.fechaLlamada': input.fechaLlamada,
            'answers.horarioLlamada': input.horarioLlamada,
          },
        },
      )
      .exec();
  }

  private isReminderDue(session: LeadSessionSnapshot, questionAt: Date): boolean {
    return (
      session.status === 'active' &&
      !session.reminderSentAt &&
      QUESTION_STEPS.includes(session.step) &&
      session.lastQuestionAt?.getTime() === questionAt.getTime()
    );
  }

  private extractQuestion(transition: StepTransition): OutboundMessagePlan | undefined {
    if (!transition.expectsReply) return undefined;
    const last = transition.outbound[transition.outbound.length - 1];
    return last && (last.options ?? []).length > 0 ? last : undefined;
  }
}
