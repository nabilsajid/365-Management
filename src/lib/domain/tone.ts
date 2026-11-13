// Colour tone for a points total measured against the monthly target.

export type Tone = 'red' | 'yellow' | 'green';

/** Share of the target at which the tone turns from red to yellow ("nearly there"). */
export const NEAR_TARGET = 0.9;

/**
 * Green once the target is reached, yellow when within 10% of it (1,350 of
 * 1,500 and up), red below that.
 */
export function pointsTone(points: number, target: number): Tone {
  if (target <= 0 || points >= target) return 'green';
  return points >= target * NEAR_TARGET ? 'yellow' : 'red';
}

/** How far along the target is, from 0 to 100. */
export function targetPercent(points: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((points / target) * 100)));
}
