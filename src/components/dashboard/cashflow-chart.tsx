'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CashflowPoint } from '@/lib/domain/dashboard';
import { money } from '@/lib/format';

// Money in is a warm orange with a faint glow; money out stays neutral grey
// (a CSS variable, so it follows the light and dark themes).
const INCOME = 'url(#income-fill)';
const EXPENSES = 'var(--color-chart-muted)';

function shortMonth(month: string): string {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `৳${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(value) >= 1_000) return `৳${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `৳${value}`;
}

/** Money received and spent per month, side by side. */
export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const rows = data.map((point) => ({ ...point, label: shortMonth(point.month) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={4}>
          <defs>
            <linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.85} />
            </linearGradient>
            <filter id="income-glow" x="-50%" y="-20%" width="200%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f97316" floodOpacity="0.28" />
            </filter>
          </defs>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} tickFormatter={compact} />
          <Tooltip
            cursor={{ fill: 'var(--color-subtle)' }}
            formatter={(value, name) => [money(Number(value)), name]}
            contentStyle={{ borderRadius: 8, border: '1px solid var(--color-line)', background: 'var(--color-card)', color: 'var(--color-ink)', fontSize: 13, boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }}
            labelStyle={{ color: 'var(--color-ink)' }}
            itemStyle={{ color: 'var(--color-ink)' }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 13, color: 'var(--color-muted)' }}
            payload={[
              { value: 'Money in', type: 'circle', id: 'income', color: '#f97316' },
              { value: 'Money out', type: 'circle', id: 'expenses', color: EXPENSES },
            ]}
          />
          <Bar dataKey="income" name="Money in" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} style={{ filter: 'url(#income-glow)' }} />
          <Bar dataKey="expenses" name="Money out" fill={EXPENSES} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
