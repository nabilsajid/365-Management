import { redirect } from 'next/navigation';

// Appearance now lives under Settings.
export default function AppearancePage() {
  redirect('/settings?tab=appearance');
}
