import { redirect } from 'next/navigation';

// Broadcasts now live under Updates.
export default function BroadcastsPage() {
  redirect('/updates?tab=broadcasts');
}
