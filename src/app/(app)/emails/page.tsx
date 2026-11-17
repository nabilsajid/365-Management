import { redirect } from 'next/navigation';

// Email approvals now live in Approvals → Emails.
export default function EmailsPage() {
  redirect('/approvals?tab=emails');
}
