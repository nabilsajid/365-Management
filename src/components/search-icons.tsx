import { FolderKanban, ListChecks, Megaphone, User, Users } from 'lucide-react';
import type { SearchKind } from '@/lib/services/search';

export function SearchIcon({ kind, size = 15 }: { kind: SearchKind; size?: number }) {
  const Icon = { project: FolderKanban, task: ListChecks, client: Users, person: User, notice: Megaphone }[kind];
  return <Icon size={size} aria-hidden />;
}
