import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-muted">
        <Icon size={18} aria-hidden />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <p className="mt-1 max-w-xs text-[13px] text-muted">{children}</p> : null}
    </div>
  );
}
