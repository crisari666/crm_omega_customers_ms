import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types, isValidObjectId } from 'mongoose';
import {
  CALL_AUDIT_SOURCE_AI,
  CALL_AUDIT_SOURCE_HUMAN,
  CALL_AUDIT_SPEAKER_AGENT,
  CALL_AUDIT_SPEAKER_CUSTOMER,
  CALL_AUDIT_STATUS_COMPLETED,
  CALL_AUDIT_STATUS_FAILED,
  CALL_AUDIT_STATUS_PENDING,
} from './constants/call-audit.constant';
import { CallAuditDeepSeekService } from './call-audit-deepseek.service';
import { CallAuditLlmConfigService } from './call-audit-llm-config.service';
import type { ListCallAuditAiReviewQueryDto } from './dto/list-call-audit-ai-review.query.dto';
import type { SubmitHumanCallAuditDto } from './dto/submit-human-call-audit.dto';
import {
  CustomerCallAudit,
  CustomerCallAuditDocument,
} from './schemas/customer-call-audit.schema';
import {
  CustomerCallLog,
  CustomerCallLogDocument,
} from '../schemas/customer-call-log.schema';
import { deriveResolvedCallOutcome } from '../utils/call-log-outcome.util';
import type {
  CallAuditIndicatorResult,
  CallAuditLlmAnalysisResult,
  CallAuditAiReviewItemDto,
  CallAuditAiReviewListResponseDto,
  CallAuditProgressResponseDto,
  CallAuditRecordDto,
  CallAuditSpeakerTurn,
  CallAuditsByCallResponseDto,
} from './types/customer-call-audit.type';
import {
  getCallAuditMonthRange,
  getDefaultCallAuditMonth,
} from './utils/call-audit-month-range.util';
import type { CallAuditSpeakerRole } from './constants/call-audit.constant';

type CallLogLean = {
  _id: Types.ObjectId;
  callSid: string;
  agentExternalRef?: string;
  transcript?: string;
  text?: string;
  direction?: string;
  durationSeconds?: number;
  from?: string;
  to?: string;
  status?: string;
  events?: CustomerCallLog['events'];
  createdAt?: Date;
};

/**
 * Persists human and AI call-quality audits; orchestrates DeepSeek analysis on transcripts.
 */
@Injectable()
export class CustomerCallAuditService {
  private readonly logger = new Logger(CustomerCallAuditService.name);

  constructor(
    @InjectModel(CustomerCallAudit.name)
    private readonly callAuditModel: Model<CustomerCallAuditDocument>,
    @InjectModel(CustomerCallLog.name)
    private readonly callLogModel: Model<CustomerCallLogDocument>,
    private readonly callAuditLlmConfigService: CallAuditLlmConfigService,
    private readonly callAuditDeepSeekService: CallAuditDeepSeekService,
    private readonly configService: ConfigService,
  ) {}

  /** Queues AI audit after transcription ingest (non-blocking; errors are logged only). */
  scheduleAnalyzeAfterTranscription(callSid: string): void {
    setImmediate(() => {
      void this.analyzeCallByCallSid(callSid).catch((err: unknown) => {
        const text = err instanceof Error ? err.message : String(err);
        this.logger.error(`Async AI audit failed for ${callSid}: ${text}`);
      });
    });
  }

  /** Runs DeepSeek audit by Twilio call SID; returns null if the call log does not exist. */
  async analyzeCallByCallSid(callSid: string): Promise<CallAuditRecordDto | null> {
    const callLog = await this.callLogModel.findOne({ callSid }).lean().exec();
    if (callLog === null) {
      return null;
    }
    return this.analyzeCallByCallLogId(String(callLog._id));
  }

  /** Runs DeepSeek audit for a call log; upserts AI audit as pending, then completed or failed. */
  async analyzeCallByCallLogId(callLogId: string): Promise<CallAuditRecordDto> {
    const callLog = await this.findCallLogOrThrow(callLogId);
    const transcript = this.resolveTranscript(callLog);
    if (transcript === '') {
      throw new BadRequestException('Call has no transcript to analyze');
    }
    const agentExternalRef = (callLog.agentExternalRef ?? '').trim();
    if (agentExternalRef === '') {
      throw new BadRequestException('Call has no agentExternalRef');
    }
    const config = this.callAuditLlmConfigService.getConfig();
    const callLogObjectId = new Types.ObjectId(String(callLog._id));
    await this.upsertAuditPending({
      callLogId: callLogObjectId,
      callSid: callLog.callSid,
      agentExternalRef,
      configVersion: config.version,
    });
    try {
      const metadata = this.buildCallMetadata(callLog);
      const { analysis, model } = await this.callAuditDeepSeekService.analyzeTranscript({
        transcript,
        agentExternalRef,
        callMetadata: metadata,
      });
      return await this.saveAiAuditCompleted({
        callLogId: callLogObjectId,
        callSid: callLog.callSid,
        agentExternalRef,
        configVersion: config.version,
        analysis,
        llmModel: model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.saveAiAuditFailed({
        callLogId: callLogObjectId,
        callSid: callLog.callSid,
        agentExternalRef,
        configVersion: config.version,
        llmError: message,
      });
      throw err;
    }
  }

  /** Saves or updates the human checklist audit for a call (coach / director). */
  async submitHumanAudit(
    callLogId: string,
    body: SubmitHumanCallAuditDto,
    auditorUserId: string,
  ): Promise<CallAuditRecordDto> {
    const callLog = await this.findCallLogOrThrow(callLogId);
    const agentExternalRef = (callLog.agentExternalRef ?? '').trim();
    if (agentExternalRef === '') {
      throw new BadRequestException('Call has no agentExternalRef');
    }
    const config = this.callAuditLlmConfigService.getConfig();
    const indicators = this.mapHumanIndicators(body, config);
    const interestScore = this.clampScore(body.interestScore, config.interestScore);
    const speakerTurns = this.mapSpeakerTurns(body.speakerTurns);
    const doc = await this.callAuditModel
      .findOneAndUpdate(
        {
          callLogId: new Types.ObjectId(callLogId),
          source: CALL_AUDIT_SOURCE_HUMAN,
        },
        {
          $set: {
            callSid: callLog.callSid,
            agentExternalRef,
            configVersion: config.version,
            indicators,
            interestScore,
            interestScoreRationale: body.interestScoreRationale?.trim(),
            speakerTurns,
            auditorUserId,
            reviewerNotes: body.reviewerNotes?.trim(),
            status: CALL_AUDIT_STATUS_COMPLETED,
            analyzedAt: new Date(),
            llmError: undefined,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    return this.toDto(doc);
  }

  /** Returns human and AI audit records plus call transcript metadata for one call log. */
  async getAuditsByCallLogId(callLogId: string): Promise<CallAuditsByCallResponseDto> {
    const callLog = await this.findCallLogOrThrow(callLogId);
    const audits = await this.callAuditModel
      .find({ callLogId: new Types.ObjectId(callLogId) })
      .exec();
    let human: CallAuditRecordDto | null = null;
    let ai: CallAuditRecordDto | null = null;
    for (const audit of audits) {
      const dto = this.toDto(audit);
      if (audit.source === CALL_AUDIT_SOURCE_HUMAN) {
        human = dto;
      } else if (audit.source === CALL_AUDIT_SOURCE_AI) {
        ai = dto;
      }
    }
    const derived = deriveResolvedCallOutcome(
      callLog.events ?? [],
      callLog.status,
    );
    return {
      callLogId,
      callSid: callLog.callSid,
      agentExternalRef: callLog.agentExternalRef,
      transcript: this.resolveTranscript(callLog),
      resolvedOutcome: derived.outcome,
      durationSeconds: callLog.durationSeconds,
      human,
      ai,
    };
  }

  /** Monthly per-asesor human audit counts and pending answered calls with transcript. */
  async getProgress(
    month: string,
    agentExternalRefFilter?: string,
  ): Promise<CallAuditProgressResponseDto> {
    const monthValue = month.trim() !== '' ? month : getDefaultCallAuditMonth();
    const timeZone = this.configService.get<string>(
      'ventorAssignment.timeZone',
      'America/Bogota',
    );
    const utcOffset = timeZone === 'America/Bogota' ? '-05:00' : '-05:00';
    const { from, to } = getCallAuditMonthRange(monthValue, utcOffset);
    const required = this.configService.get<number>(
      'callAudit.requiredHumanAuditsPerMonth',
      3,
    );
    const callLogs = await this.callLogModel
      .find({
        createdAt: { $gte: from, $lte: to },
        agentExternalRef: { $exists: true, $nin: [null, ''] },
        $or: [
          { transcript: { $exists: true, $nin: [null, ''] } },
          { text: { $exists: true, $nin: [null, ''] } },
        ],
      })
      .select({
        _id: 1,
        callSid: 1,
        agentExternalRef: 1,
        events: 1,
        status: 1,
        transcript: 1,
        text: 1,
        durationSeconds: 1,
        createdAt: 1,
      })
      .lean<CallLogLean[]>()
      .exec();
    const eligibleByAgent = new Map<
      string,
      Array<{ id: string; durationSeconds: number; createdAt: number }>
    >();
    for (const row of callLogs) {
      const agentRef = String(row.agentExternalRef ?? '').trim();
      if (agentRef === '') {
        continue;
      }
      if (
        agentExternalRefFilter !== undefined &&
        agentExternalRefFilter.trim() !== '' &&
        agentRef !== agentExternalRefFilter.trim()
      ) {
        continue;
      }
      const derived = deriveResolvedCallOutcome(row.events ?? [], row.status);
      if (derived.outcome !== 'answered') {
        continue;
      }
      const transcript = this.resolveTranscript(row);
      if (transcript === '') {
        continue;
      }
      const list = eligibleByAgent.get(agentRef) ?? [];
      list.push({
        id: String(row._id),
        durationSeconds: Number(row.durationSeconds ?? 0),
        createdAt: new Date(row.createdAt ?? 0).getTime(),
      });
      eligibleByAgent.set(agentRef, list);
    }
    const agentRefs = Array.from(eligibleByAgent.keys());
    const humanCounts = await this.countHumanAuditsByAgents(agentRefs, from, to);
    const auditedCallLogIds = await this.findHumanAuditedCallLogIds(
      agentRefs,
      from,
      to,
    );
    const agents = agentRefs.map((agentExternalRef) => {
      const eligible = eligibleByAgent.get(agentExternalRef) ?? [];
      const auditedSet = auditedCallLogIds.get(agentExternalRef) ?? new Set<string>();
      const pending = eligible
        .filter((c) => !auditedSet.has(c.id))
        .sort((a, b) => {
          if (b.durationSeconds !== a.durationSeconds) {
            return b.durationSeconds - a.durationSeconds;
          }
          return b.createdAt - a.createdAt;
        })
        .map((c) => c.id);
      return {
        agentExternalRef,
        humanAuditCount: humanCounts.get(agentExternalRef) ?? 0,
        required,
        pendingCallLogIds: pending,
      };
    });
    agents.sort((a, b) => a.agentExternalRef.localeCompare(b.agentExternalRef));
    return { month: monthValue, required, agents };
  }

  /** CRM admin list of answered calls with AI audit status (optional filter: missing/failed AI only). */
  async listAiReviewForAdmin(
    query: ListCallAuditAiReviewQueryDto,
  ): Promise<CallAuditAiReviewListResponseDto> {
    const monthValue = query.month.trim();
    const skip = query.skip ?? 0;
    const limit = query.limit ?? 100;
    const timeZone = this.configService.get<string>(
      'ventorAssignment.timeZone',
      'America/Bogota',
    );
    const utcOffset = timeZone === 'America/Bogota' ? '-05:00' : '-05:00';
    const { from, to } = getCallAuditMonthRange(monthValue, utcOffset);
    const callLogs = await this.callLogModel
      .find({
        createdAt: { $gte: from, $lte: to },
        agentExternalRef: { $exists: true, $nin: [null, ''] },
        $or: [
          { transcript: { $exists: true, $nin: [null, ''] } },
          { text: { $exists: true, $nin: [null, ''] } },
        ],
      })
      .select({
        _id: 1,
        callSid: 1,
        agentExternalRef: 1,
        events: 1,
        status: 1,
        transcript: 1,
        text: 1,
        durationSeconds: 1,
        createdAt: 1,
      })
      .lean<CallLogLean[]>()
      .exec();
    const eligible: Array<CallLogLean & { callLogId: string; completedAt?: string }> = [];
    for (const row of callLogs) {
      const agentRef = String(row.agentExternalRef ?? '').trim();
      if (agentRef === '') {
        continue;
      }
      if (
        query.agentExternalRef !== undefined &&
        query.agentExternalRef.trim() !== '' &&
        agentRef !== query.agentExternalRef.trim()
      ) {
        continue;
      }
      const derived = deriveResolvedCallOutcome(row.events ?? [], row.status);
      if (derived.outcome !== 'answered') {
        continue;
      }
      if (this.resolveTranscript(row) === '') {
        continue;
      }
      eligible.push({
        ...row,
        callLogId: String(row._id),
        completedAt: derived.completedAtIso,
      });
    }
    eligible.sort(
      (a, b) =>
        new Date(b.completedAt ?? b.createdAt ?? 0).getTime() -
        new Date(a.completedAt ?? a.createdAt ?? 0).getTime(),
    );
    const callLogObjectIds = eligible.map((row) => new Types.ObjectId(row.callLogId));
    const aiDocs =
      callLogObjectIds.length === 0
        ? []
        : await this.callAuditModel
            .find({
              callLogId: { $in: callLogObjectIds },
              source: CALL_AUDIT_SOURCE_AI,
            })
            .exec();
    const aiByCallLogId = new Map<string, CustomerCallAuditDocument>();
    for (const doc of aiDocs) {
      aiByCallLogId.set(String(doc.callLogId), doc);
    }
    let items: CallAuditAiReviewItemDto[] = eligible.map((row) => {
      const aiDoc = aiByCallLogId.get(row.callLogId);
      const aiStatus = this.resolveAiStatus(aiDoc);
      return {
        callLogId: row.callLogId,
        callSid: row.callSid,
        agentExternalRef: String(row.agentExternalRef ?? ''),
        completedAt: row.completedAt,
        durationSeconds: row.durationSeconds,
        aiStatus,
        ai: aiDoc !== undefined ? this.toDto(aiDoc) : null,
      };
    });
    if (query.onlyWithoutAi === true) {
      items = items.filter(
        (item) => item.aiStatus === 'none' || item.aiStatus === 'failed',
      );
    }
    const total = items.length;
    const page = items.slice(skip, skip + limit);
    return { month: monthValue, items: page, total, skip, limit };
  }

  private resolveAiStatus(
    doc: CustomerCallAuditDocument | undefined,
  ): CallAuditAiReviewItemDto['aiStatus'] {
    if (doc === undefined) {
      return 'none';
    }
    if (doc.status === CALL_AUDIT_STATUS_PENDING) {
      return 'pending';
    }
    if (doc.status === CALL_AUDIT_STATUS_FAILED) {
      return 'failed';
    }
    return 'completed';
  }

  private async findCallLogOrThrow(callLogId: string): Promise<CallLogLean> {
    if (!isValidObjectId(callLogId)) {
      throw new BadRequestException('Invalid callLogId');
    }
    const doc = await this.callLogModel.findById(callLogId).lean<CallLogLean>().exec();
    if (doc === null) {
      throw new NotFoundException('Call log not found');
    }
    return doc;
  }

  private resolveTranscript(callLog: {
    transcript?: string;
    text?: string;
  }): string {
    return (callLog.transcript ?? callLog.text ?? '').trim();
  }

  private buildCallMetadata(callLog: CallLogLean): string {
    const parts: string[] = [];
    if (callLog.direction !== undefined) {
      parts.push(`direction: ${String(callLog.direction)}`);
    }
    if (callLog.durationSeconds !== undefined) {
      parts.push(`durationSeconds: ${String(callLog.durationSeconds)}`);
    }
    if (callLog.from !== undefined) {
      parts.push(`from: ${String(callLog.from)}`);
    }
    if (callLog.to !== undefined) {
      parts.push(`to: ${String(callLog.to)}`);
    }
    if (callLog.status !== undefined) {
      parts.push(`status: ${String(callLog.status)}`);
    }
    return parts.join('; ');
  }

  private mapHumanIndicators(
    body: SubmitHumanCallAuditDto,
    config: ReturnType<CallAuditLlmConfigService['getConfig']>,
  ): CallAuditIndicatorResult[] {
    const byKey = new Map(body.indicators.map((i) => [i.key, i]));
    return config.indicators.map((indicator) => {
      const submitted = byKey.get(indicator.key);
      if (submitted === undefined) {
        throw new BadRequestException(`Missing indicator: ${indicator.key}`);
      }
      return {
        key: indicator.key,
        label: indicator.label,
        passed: submitted.passed,
        rationale: submitted.rationale?.trim(),
      };
    });
  }

  private clampScore(
    score: number,
    range: { min: number; max: number },
  ): number {
    const rounded = Math.round(score);
    if (rounded < range.min) {
      return range.min;
    }
    if (rounded > range.max) {
      return range.max;
    }
    return rounded;
  }

  private mapSpeakerTurns(
    raw: SubmitHumanCallAuditDto['speakerTurns'],
  ): CallAuditSpeakerTurn[] | undefined {
    if (raw === undefined || raw.length === 0) {
      return undefined;
    }
    const turns: CallAuditSpeakerTurn[] = [];
    for (const item of raw) {
      const roleRaw = item.role.toLowerCase();
      const role: CallAuditSpeakerRole =
        roleRaw === CALL_AUDIT_SPEAKER_AGENT || roleRaw === 'asesor'
          ? CALL_AUDIT_SPEAKER_AGENT
          : CALL_AUDIT_SPEAKER_CUSTOMER;
      const text = item.text.trim();
      if (text !== '') {
        turns.push({ role, text });
      }
    }
    return turns.length > 0 ? turns : undefined;
  }

  private async upsertAuditPending(input: {
    callLogId: Types.ObjectId;
    callSid: string;
    agentExternalRef: string;
    configVersion: string;
  }): Promise<void> {
    await this.callAuditModel
      .updateOne(
        { callLogId: input.callLogId, source: CALL_AUDIT_SOURCE_AI },
        {
          $setOnInsert: {
            callLogId: input.callLogId,
            callSid: input.callSid,
            source: CALL_AUDIT_SOURCE_AI,
          },
          $set: {
            agentExternalRef: input.agentExternalRef,
            configVersion: input.configVersion,
            status: CALL_AUDIT_STATUS_PENDING,
            indicators: [],
            interestScore: 1,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private async saveAiAuditCompleted(input: {
    callLogId: Types.ObjectId;
    callSid: string;
    agentExternalRef: string;
    configVersion: string;
    analysis: CallAuditLlmAnalysisResult;
    llmModel: string;
  }): Promise<CallAuditRecordDto> {
    const config = this.callAuditLlmConfigService.getConfig();
    const indicators = this.mapAiIndicators(input.analysis, config);
    const doc = await this.callAuditModel
      .findOneAndUpdate(
        { callLogId: input.callLogId, source: CALL_AUDIT_SOURCE_AI },
        {
          $set: {
            callSid: input.callSid,
            agentExternalRef: input.agentExternalRef,
            configVersion: input.configVersion,
            indicators,
            interestScore: input.analysis.interestScore,
            interestScoreRationale: input.analysis.interestScoreRationale,
            speakerTurns: input.analysis.speakerTurns,
            status: CALL_AUDIT_STATUS_COMPLETED,
            llmModel: input.llmModel,
            analyzedAt: new Date(),
            llmError: undefined,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    return this.toDto(doc);
  }

  private async saveAiAuditFailed(input: {
    callLogId: Types.ObjectId;
    callSid: string;
    agentExternalRef: string;
    configVersion: string;
    llmError: string;
  }): Promise<void> {
    await this.callAuditModel
      .updateOne(
        { callLogId: input.callLogId, source: CALL_AUDIT_SOURCE_AI },
        {
          $set: {
            callSid: input.callSid,
            agentExternalRef: input.agentExternalRef,
            configVersion: input.configVersion,
            status: CALL_AUDIT_STATUS_FAILED,
            llmError: input.llmError,
            analyzedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private mapAiIndicators(
    analysis: CallAuditLlmAnalysisResult,
    config: ReturnType<CallAuditLlmConfigService['getConfig']>,
  ): CallAuditIndicatorResult[] {
    const byKey = new Map(analysis.indicators.map((i) => [i.key, i]));
    return config.indicators.map((indicator) => {
      const row = byKey.get(indicator.key);
      return {
        key: indicator.key,
        label: indicator.label,
        passed: row?.passed === true,
        rationale: row?.rationale,
        evidence: row?.evidence,
      };
    });
  }

  private async countHumanAuditsByAgents(
    agentRefs: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (agentRefs.length === 0) {
      return result;
    }
    const rows = await this.callAuditModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            source: CALL_AUDIT_SOURCE_HUMAN,
            status: CALL_AUDIT_STATUS_COMPLETED,
            agentExternalRef: { $in: agentRefs },
            createdAt: { $gte: from, $lte: to },
          },
        },
        { $group: { _id: '$agentExternalRef', count: { $sum: 1 } } },
      ])
      .exec();
    for (const row of rows) {
      result.set(row._id, row.count);
    }
    return result;
  }

  private async findHumanAuditedCallLogIds(
    agentRefs: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    if (agentRefs.length === 0) {
      return result;
    }
    const rows = await this.callAuditModel
      .find({
        source: CALL_AUDIT_SOURCE_HUMAN,
        status: CALL_AUDIT_STATUS_COMPLETED,
        agentExternalRef: { $in: agentRefs },
        createdAt: { $gte: from, $lte: to },
      })
      .select({ callLogId: 1, agentExternalRef: 1 })
      .lean()
      .exec();
    for (const row of rows) {
      const agent = String(row.agentExternalRef);
      const set = result.get(agent) ?? new Set<string>();
      set.add(String(row.callLogId));
      result.set(agent, set);
    }
    return result;
  }

  private toDto(doc: CustomerCallAuditDocument): CallAuditRecordDto {
    const withTimestamps = doc as CustomerCallAuditDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    const createdAt =
      withTimestamps.createdAt !== undefined
        ? new Date(withTimestamps.createdAt).toISOString()
        : new Date(0).toISOString();
    const updatedAt =
      withTimestamps.updatedAt !== undefined
        ? new Date(withTimestamps.updatedAt).toISOString()
        : createdAt;
    return {
      id: String(doc._id),
      callLogId: String(doc.callLogId),
      callSid: doc.callSid,
      agentExternalRef: doc.agentExternalRef,
      source: doc.source,
      configVersion: doc.configVersion,
      indicators: doc.indicators.map((i) => ({
        key: i.key,
        label: i.label,
        passed: i.passed,
        rationale: i.rationale,
        evidence: i.evidence,
      })),
      interestScore: doc.interestScore,
      interestScoreRationale: doc.interestScoreRationale,
      speakerTurns: doc.speakerTurns?.map((t) => ({
        role: t.role,
        text: t.text,
      })),
      auditorUserId: doc.auditorUserId,
      reviewerNotes: doc.reviewerNotes,
      status: doc.status,
      llmModel: doc.llmModel,
      llmError: doc.llmError,
      analyzedAt:
        doc.analyzedAt !== undefined
          ? new Date(doc.analyzedAt).toISOString()
          : undefined,
      createdAt,
      updatedAt,
    };
  }
}