import { Injectable } from '@nestjs/common';
import { MAX_SCORE_V2 } from '../constants/lead-conversation.constants';
import type { LeadProfile } from '../types/lead-profile.type';
import type { LeadScoreSignal } from '../types/lead-score-signal.type';
import type { LeadTemperature } from '../types/lead-temperature.type';
import {
  LEAD_HIGH_INTENT_INTENTS,
  LEAD_HOT_MIN_SCORE,
  LEAD_PRIORITY_BY_TEMPERATURE,
  LEAD_SCORE_POINTS,
  LEAD_SCORE_SEGMENT_LABELS,
  LEAD_WARM_MIN_SCORE,
} from './constants/lead-agent.constants';
import type { LeadAgentIntent } from './types/lead-agent-intent.type';
import type { LeadScoreSegment } from './types/lead-score-segment.type';

const isKnownSignal = (value: string): value is LeadScoreSignal => value in LEAD_SCORE_POINTS;

type LeadScoreSegmentKey = keyof typeof LEAD_SCORE_SEGMENT_LABELS;

const SEGMENT_KEYS = Object.keys(LEAD_SCORE_SEGMENT_LABELS) as LeadScoreSegmentKey[];

const hasText = (value: string | undefined): boolean => (value ?? '').trim().length > 0;

/**
 * Pure V2 lead score: signals (derived from the lead profile and intents) add points up to {@link MAX_SCORE_V2}.
 */
@Injectable()
export class LeadAgentScoringService {
  /** Signals earned by the profile and the turn intents, merged (unique) with the already stored ones. */
  deriveSignals(
    profile: LeadProfile,
    intents: readonly LeadAgentIntent[],
    existing: readonly string[],
  ): LeadScoreSignal[] {
    const derived: LeadScoreSignal[] = [];
    if (profile.motivation != null && profile.motivation !== 'exploring') derived.push('motivation_known');
    if (profile.paymentMethod != null) derived.push('payment_known');
    if (profile.timeline === 'within_3_months') derived.push('timeline_soon');
    if (profile.timeline === 'later') derived.push('timeline_later');
    if (hasText(profile.budget) || hasText(profile.lotPreference)) derived.push('budget_known');
    if (intents.some((intent) => LEAD_HIGH_INTENT_INTENTS.includes(intent))) derived.push('high_intent_question');
    return [...new Set<LeadScoreSignal>([...existing.filter(isKnownSignal), ...derived])];
  }

  /** Sum of the signal points; `timeline_later` is ignored when `timeline_soon` is present. Capped at 100. */
  computeScore(signals: readonly string[]): number {
    const known = [...new Set(signals.filter(isKnownSignal))];
    const hasSoon = known.includes('timeline_soon');
    const total = known
      .filter((signal) => !(hasSoon && signal === 'timeline_later'))
      .reduce((sum, signal) => sum + LEAD_SCORE_POINTS[signal], 0);
    return Math.min(total, MAX_SCORE_V2);
  }

  /** hot ≥ 60, warm 30–59, cold < 30. */
  deriveTemperature(score: number): LeadTemperature {
    if (score >= LEAD_HOT_MIN_SCORE) return 'hot';
    return score >= LEAD_WARM_MIN_SCORE ? 'warm' : 'cold';
  }

  /** hot 3, warm 2, cold 1. */
  derivePriority(temperature: LeadTemperature): number {
    return LEAD_PRIORITY_BY_TEMPERATURE[temperature];
  }

  /** One segment per scoring concern; both timeline signals share the "Plazo" segment worth 20. */
  buildScoreSegments(signals: readonly string[]): LeadScoreSegment[] {
    const earned = new Set(signals.filter(isKnownSignal));
    return SEGMENT_KEYS.map((key) => this.buildSegment(key, earned));
  }

  private buildSegment(key: LeadScoreSegmentKey, earned: ReadonlySet<LeadScoreSignal>): LeadScoreSegment {
    const label = LEAD_SCORE_SEGMENT_LABELS[key];
    if (key === 'timeline') {
      const earnedPoints = this.resolveTimelinePoints(earned);
      return { key, label, points: LEAD_SCORE_POINTS.timeline_soon, earnedPoints, isEarned: earnedPoints > 0 };
    }
    const isEarned = earned.has(key);
    return { key, label, points: LEAD_SCORE_POINTS[key], earnedPoints: isEarned ? LEAD_SCORE_POINTS[key] : 0, isEarned };
  }

  private resolveTimelinePoints(earned: ReadonlySet<LeadScoreSignal>): number {
    if (earned.has('timeline_soon')) return LEAD_SCORE_POINTS.timeline_soon;
    return earned.has('timeline_later') ? LEAD_SCORE_POINTS.timeline_later : 0;
  }
}
