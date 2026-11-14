import { redirect } from 'next/navigation';

// Notices now live under Updates.
export default function NoticesPage() {
  redirect('/updates');
}
