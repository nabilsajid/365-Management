'use client';

import { Check, Target } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { pointsTone, targetPercent } from '@/lib/domain/tone';
import { cn } from '@/lib/utils';
import { CountUp } from './count-up';

/**
 * The viewer's points for the month against the target. Subtly red below the
 * mark, yellow when close, green once reached. The first time the target is
 * seen as reached in a month, the tile celebrates briefly.
 */
export function PointsTile({ points, target, month, className }: { points: number; target: number; month: string; className?: string }) {
  const tone = pointsTone(points, target);
  const percent = targetPercent(points, target);
  const reached = points >= target && target > 0;
  const [celebrate, setCelebrate] = useState(false);
  const [filled, setFilled] = useState(0);

  // Let the bar grow from zero on first paint.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  useEffect(() => {
    if (!reached) return;
    const key = `target-celebrated-${month}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch {
      return;
    }
    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 2600);
    return () => clearTimeout(timer);
  }, [reached, month]);

  const remaining = Math.max(0, target - points);

  return (
    <Link href="/employees" className={cn('tile', `tone-${tone}`, celebrate && 'celebrate', className)}>
      <div className="flex items-center justify-between">
        <p className="tile-label">My points this month</p>
        <span className="tile-icon">{reached ? <Check size={16} aria-hidden className={celebrate ? 'pop' : undefined} /> : <Target size={16} aria-hidden />}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">
        <CountUp value={points} />
        <span className="ml-1.5 text-base font-medium text-muted">/ {target.toLocaleString('en-US')}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Progress toward the monthly target"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div className="tone-bar h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${filled}%` }} />
      </div>
      <p className="tile-note">
        {reached
          ? `Target reached${points > target ? `, ${(points - target).toLocaleString('en-US')} above` : ''}`
          : `${remaining.toLocaleString('en-US')} to go`}
      </p>
    </Link>
  );
}
