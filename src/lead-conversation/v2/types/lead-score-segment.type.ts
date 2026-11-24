/** One slice of the V2 score breakdown (for the score bar in the UI). */
export type LeadScoreSegment = {
  readonly key: string;
  /** Spanish label. */
  readonly label: string;
  /** Maximum points this segment can add. */
  readonly points: number;
  /** Points currently earned (timeline may earn fewer points than its maximum). */
  readonly earnedPoints: number;
  readonly isEarned: boolean;
};
