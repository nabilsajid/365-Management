import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  primary: 'bg-primary-soft text-primary-hover',
  success: 'bg-success-soft text-green-700',
  warning: 'bg-warning-soft text-amber-700',
  danger: 'bg-danger-soft text-red-700',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}
