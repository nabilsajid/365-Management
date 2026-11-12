'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CashflowPoint } from '@/lib/domain/dashboard';
import { money } from '@/lib/format';

const INCOME = '#2563eb';
const EXPENSES = '#94a3b8';

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
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fill: '#64748b', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={compact} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            formatter={(value, name) => [money(Number(value)), name]}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxShadow: '0 4px 12px rgb(15 23 42 / 0.06)' }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, color: '#64748b' }} />
          <Bar dataKey="income" name="Money in" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name="Money out" fill={EXPENSES} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
