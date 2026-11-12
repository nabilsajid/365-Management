import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getPageContext } from '@/lib/page';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, orgId, profile, isAdmin } = await getPageContext();
  const { data } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();

  return (
    <AppShell
      orgName={(data?.name as string | undefined) ?? '365 Management'}
      userName={profile.full_name}
      jobTitle={profile.job_title}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  );
}
