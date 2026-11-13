'use client';

import { Check, ChevronDown, ChevronRight, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppInstall } from '@/components/app-install';
import { cn } from '@/lib/utils';
import { locate, navFor, type Viewer } from './nav';

const STORAGE_KEY = 'sidebar-collapsed';
const THEME_KEY = 'theme';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function SidebarNav({
  viewer,
  badges,
  collapsed,
  pathname,
  onNavigate,
}: {
  viewer: Viewer;
  /** Counts shown beside links, keyed by href (things waiting for this person). */
  badges: Record<string, number>;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  // Highlight the tapped link straight away instead of waiting for the page to load.
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);
  const current = tapped ?? locate(pathname, viewer)?.href;
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {navFor(viewer).map((group) => (
        <div key={group.title} className="mb-5">
          <p
            className={cn(
              'mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted',
              collapsed && 'sr-only',
            )}
          >
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      setTapped(item.href);
                      onNavigate?.();
                    }}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'relative flex h-10 items-center gap-3 rounded-control px-3 text-[13px] font-medium no-underline transition-colors duration-100 hover:no-underline active:scale-[0.98]',
                      active
                        ? 'bg-primary text-on-primary'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon size={17} aria-hidden className="shrink-0" />
                    <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>{item.label}</span>
                    {badges[item.href] ? (
                      <span
                        className={cn(
                          'rounded-full bg-warning px-1.5 text-[11px] font-semibold leading-5 text-white',
                          collapsed && 'absolute right-1.5 top-1 h-2 w-2 p-0 text-[0px] leading-none',
                        )}
                        aria-label={`${badges[item.href]} waiting`}
                      >
                        {badges[item.href]}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ orgName, collapsed }: { orgName: string; collapsed: boolean }) {
  // The company logo: the full wordmark when the sidebar is open, the mark alone when collapsed.
  return (
    <div className={cn('flex h-14 shrink-0 items-center border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
      {collapsed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo-mark.png" alt={orgName} width={29} height={28} className="h-7 w-auto" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo.png" alt={orgName} width={114} height={34} className="h-[34px] w-auto" />
      )}
    </div>
  );
}

/** Brief confirmations such as "Saved." or "Sent to an admin for approval." */
function Toast() {
  const [toast, setToast] = useState<{ message: string; tone: string; id: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string; tone?: string } | string;
      const message = typeof detail === 'string' ? detail : (detail?.message ?? '');
      const tone = typeof detail === 'string' ? 'plain' : (detail?.tone ?? 'plain');
      setToast({ message, tone, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), tone === 'success' ? 3200 : 2600);
    };
    window.addEventListener('app:toast', show);
    return () => {
      window.removeEventListener('app:toast', show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      {toast ? (
        <span
          key={toast.id}
          className={cn(
            'toast-in flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium shadow-lg',
            toast.tone === 'success' ? 'border-success bg-success text-white' : 'border-line-strong bg-ink text-page',
          )}
        >
          {toast.tone === 'success' ? (
            <span className="pop flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
              <Check size={13} aria-hidden strokeWidth={3} />
            </span>
          ) : null}
          {toast.message}
        </span>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // The inline script in the root layout has already applied the saved theme.
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []);

  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Ignore: the choice just won't be remembered.
    }
    setDark(!dark);
  }

  return (
    <div className="flex items-center gap-1.5 text-muted">
      <Sun size={15} aria-hidden className={cn('hidden sm:block', !dark && 'text-ink')} />
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Dark mode"
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={toggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border border-line-strong transition-colors duration-150',
          dark ? 'bg-primary' : 'bg-subtle',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full shadow-sm transition-transform duration-150 ease-out',
            dark ? 'translate-x-5 bg-on-primary text-primary' : 'translate-x-0 bg-card text-muted',
          )}
        >
          {dark ? <Moon size={11} aria-hidden /> : <Sun size={11} aria-hidden />}
        </span>
      </button>
      <Moon size={15} aria-hidden className={cn('hidden sm:block', dark && 'text-ink')} />
    </div>
  );
}

function UserMenu({ name, jobTitle, isAdmin }: { name: string; jobTitle: string | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-control py-1 pl-1 pr-2 transition-colors hover:bg-subtle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-strong">
          {initials(name) || '?'}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium text-ink">{name}</span>
          <span className="block max-w-[180px] truncate text-[11px] text-muted">{jobTitle ?? 'No role yet'}</span>
        </span>
        <ChevronDown size={15} aria-hidden className="text-muted" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 rounded-card border border-line bg-card p-1.5 shadow-lg shadow-slate-900/5">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-[13px] font-medium text-ink">{name}</p>
            <p className="text-xs text-muted">
              {jobTitle ?? 'No role yet'}
              {isAdmin ? ' · Full access' : ''}
            </p>
          </div>
          <form action="/auth/signout" method="post" className="pt-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-subtle"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  orgName,
  userName,
  jobTitle,
  isAdmin,
  segments,
  notice,
  badges = {},
  children,
}: {
  orgName: string;
  userName: string;
  jobTitle: string | null;
  isAdmin: boolean;
  segments: string[];
  /** A message shown above every page, for example a pending database update. */
  notice?: string | null;
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const viewer = useMemo<Viewer>(() => ({ isAdmin, segments: new Set(segments) }), [isAdmin, segments]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const here = locate(pathname, viewer);

  // Remember the collapsed sidebar on this device.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '0' : '1');
      } catch {
        // Ignore: the choice just won't be remembered.
      }
      return !value;
    });
  }

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-sidebar-line bg-sidebar transition-[width] duration-200 ease-out lg:flex',
          collapsed ? 'w-16' : 'w-[250px]',
        )}
      >
        <Brand orgName={orgName} collapsed={collapsed} />
        <SidebarNav viewer={viewer} badges={badges} collapsed={collapsed} pathname={pathname} />
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-control px-3 text-[13px] font-medium text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
            <span className={cn(collapsed && 'sr-only')}>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="fade-in absolute inset-0 h-full w-full cursor-default bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="drawer-in relative flex h-full w-[270px] max-w-[85vw] flex-col bg-sidebar">
            <Brand orgName={orgName} collapsed={false} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-control text-sidebar-text hover:bg-sidebar-hover hover:text-white"
            >
              <X size={18} aria-hidden />
            </button>
            <SidebarNav viewer={viewer} badges={badges} collapsed={false} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className={cn('transition-[padding] duration-200 ease-out', collapsed ? 'lg:pl-16' : 'lg:pl-[250px]')}>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-card/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-control text-ink transition-colors duration-100 hover:bg-subtle active:scale-95 lg:hidden"
          >
            <Menu size={19} aria-hidden />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
            {here ? (
              <>
                <span className="hidden text-muted sm:inline">{here.group}</span>
                <ChevronRight size={14} aria-hidden className="hidden text-line-strong sm:inline" />
                {pathname === here.href ? (
                  <span className="truncate font-medium text-ink">{here.label}</span>
                ) : (
                  <>
                    <Link href={here.href} className="truncate text-muted hover:text-ink">
                      {here.label}
                    </Link>
                    <ChevronRight size={14} aria-hidden className="text-line-strong" />
                    <span className="font-medium text-ink">Details</span>
                  </>
                )}
              </>
            ) : (
              <span className="font-medium text-ink">365 Management</span>
            )}
          </nav>
          <AppInstall />
          <ThemeToggle />
          <UserMenu name={userName} jobTitle={jobTitle} isAdmin={isAdmin} />
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
          {notice ? (
            <p role="alert" className="mb-5 rounded-card border border-warning bg-warning-soft px-4 py-3 text-[13px] text-warning-strong">
              {notice}
            </p>
          ) : null}
          {children}
        </main>
        <Toast />
      </div>
    </div>
  );
}
