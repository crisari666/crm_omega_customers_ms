import { Injectable } from '@nestjs/common';
import { MAX_SCORE } from './constants/lead-conversation.constants';
import type { LeadScoreEvent } from './types/score-event.type';

const POINTS_BY_EVENT: Readonly<Record<Exclude<LeadScoreEvent, 'reminder_declined'>, number>> = {
  lot_range: 1,
  payment: 2,
  schedule: 3,
};

const DECLINED_SCORE = 1 as const;
const LOWEST_PRIORITY = 1 as const;
const HIGH_PRIORITY_MIN_SCORE = 5 as const;
const MEDIUM_PRIORITY_MIN_SCORE = 2 as const;

export type LeadScoreState = {
  readonly score: number;
  readonly priority: number;
  readonly scoreHistory: readonly { step: string; points: number; at: Date }[];
};

/**
 * Lead score rules: project plan + lot size +1, payment method +2, call scheduled +3 (max 6).
 * Declining the reminder forces score 1 / priority 1. Priority: 1 low, 2 medium, 3 high.
 */
@Injectable()
export class LeadScoringService {
  applyScoreEvent(state: LeadScoreState, event: LeadScoreEvent, at: Date = new Date()): LeadScoreState {
    if (event === 'reminder_declined') {
      return {
        score: DECLINED_SCORE,
        priority: LOWEST_PRIORITY,
        scoreHistory: [...state.scoreHistory, { step: event, points: DECLINED_SCORE - state.score, at }],
      };
    }
    if (state.scoreHistory.some((entry) => entry.step === event)) {
      return state;
    }
    const points = POINTS_BY_EVENT[event];
    const score = Math.min(MAX_SCORE, state.score + points);
    return {
      score,
      priority: this.derivePriority(score),
      scoreHistory: [...state.scoreHistory, { step: event, points, at }],
    };
  }

  derivePriority(score: number): number {
    if (score >= HIGH_PRIORITY_MIN_SCORE) return 3;
    if (score >= MEDIUM_PRIORITY_MIN_SCORE) return 2;
    return LOWEST_PRIORITY;
  }
}
