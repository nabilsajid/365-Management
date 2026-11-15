import {
  HandCoins,
  Banknote,
  CalendarOff,
  Compass,
  FileText,
  FolderKanban,
  ListChecks,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Package,
  PackagePlus,
  Receipt,
  Search,
  User,
  Users,
} from 'lucide-react';
import type { SearchKind } from '@/lib/services/search';

const ICONS = {
  page: Compass,
  project: FolderKanban,
  task: ListChecks,
  person: User,
  client: Users,
  investor: HandCoins,
  invoice: FileText,
  expense: Receipt,
  equipment: Package,
  need: PackagePlus,
  notice: Megaphone,
  message: MessagesSquare,
  comment: MessageSquare,
  leave: CalendarOff,
  other: Search,
} satisfies Record<SearchKind, unknown>;

export function SearchIcon({ kind, size = 15 }: { kind: SearchKind; size?: number }) {
  const Icon = ICONS[kind] ?? Banknote;
  return <Icon size={size} aria-hidden />;
}
