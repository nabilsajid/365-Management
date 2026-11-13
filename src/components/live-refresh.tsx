'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';

/**
 * Keeps every open page up to date without anyone pressing refresh.
 *
 * The database keeps one counter per organization that goes up whenever
 * anything changes. This listens for it moving (and also checks every 15
 * seconds and when the app comes back to the front, in case the live
 * connection is not available) and then reloads the page's data in place.
 * Forms being filled in are left alone.
 */
export function LiveRefresh({ orgId }: { orgId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let last: number | null = null;
    let pending: ReturnType<typeof setTimeout> | undefined;

    // Several changes close together cause one reload, not many.
    const refreshSoon = () => {
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 500);
    };
    const seen = (version: number) => {
      if (last !== null && version !== last) refreshSoon();
      last = version;
    };
    const check = async () => {
      if (document.hidden) return;
      const { data, error } = await supabase.from('org_activity').select('version').eq('org_id', orgId).maybeSingle();
      if (!error && data) seen(Number(data.version));
    };

    void check();
    const poll = setInterval(check, 15000);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);

    const channel = supabase
      .channel(`org-activity-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_activity', filter: `org_id=eq.${orgId}` }, (payload) => {
        const version = Number((payload.new as { version?: number } | null)?.version);
        if (Number.isFinite(version)) seen(version);
        else refreshSoon();
      })
      .subscribe();

    return () => {
      clearTimeout(pending);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return null;
}
