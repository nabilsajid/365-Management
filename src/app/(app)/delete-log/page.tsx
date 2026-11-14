import { redirect } from 'next/navigation';

// The delete log now lives under Settings.
export default function DeleteLogPage() {
  redirect('/settings?tab=delete-log');
}
